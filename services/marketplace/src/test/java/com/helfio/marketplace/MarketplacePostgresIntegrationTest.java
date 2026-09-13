package com.helfio.marketplace;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.nio.file.*;
import java.sql.Connection;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MarketplacePostgresIntegrationTest {
  private static final UUID CATEGORY_ID = UUID.fromString("10000000-0000-4000-8000-000000000001");
  private static final UUID CUSTOMER_ID = UUID.fromString("10000000-0000-4000-8000-000000000002");
  private static final UUID PROVIDER_A_ID = UUID.fromString("10000000-0000-4000-8000-000000000003");
  private static final UUID PROVIDER_B_ID = UUID.fromString("10000000-0000-4000-8000-000000000004");

  @Container
  static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
      .withDatabaseName("helfio_test")
      .withUsername("helfio")
      .withPassword("helfio");

  private JdbcTemplate jdbc;
  private MarketplaceService service;
  private TransactionTemplate transactions;

  @BeforeAll
  void migrateIsolatedDatabase() throws Exception {
    var dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    jdbc = new JdbcTemplate(dataSource);
    transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    try (Connection connection = dataSource.getConnection()) {
      Path migrationDirectory = Files.exists(Path.of("db/migrations")) ? Path.of("db/migrations") : Path.of("../../db/migrations");
      try (var migrations = Files.list(migrationDirectory).sorted().toList().stream()) {
        for (Path migration : migrations.toList()) ScriptUtils.executeSqlScript(connection, new FileSystemResource(migration.toFile()));
      }
    }
    service = new MarketplaceService(jdbc, new DomainEvents(jdbc, new com.fasterxml.jackson.databind.ObjectMapper()));
  }

  @BeforeEach
  void seedIsolatedFixture() {
    jdbc.update("TRUNCATE domain_events, users, categories CASCADE");
    jdbc.update("INSERT INTO categories(id,slug,status,icon,sort_order,show_in_navigation,show_on_homepage) VALUES (?, 'cleaning', 'active', 'clean', 1, true, true)", CATEGORY_ID);
    for (String locale : List.of("en", "de", "sq", "tr")) jdbc.update("INSERT INTO category_translations(category_id,locale,name,description) VALUES (?, ?, 'Cleaning', 'Cleaning services')", CATEGORY_ID, locale);
    insertUser(CUSTOMER_ID, "customer-sub", "Customer");
    insertUser(PROVIDER_A_ID, "provider-a-sub", "Provider A");
    insertUser(PROVIDER_B_ID, "provider-b-sub", "Provider B");
    insertProvider(PROVIDER_A_ID, "Provider A");
    insertProvider(PROVIDER_B_ID, "Provider B");
  }

  @AfterAll
  void closeContainer() { POSTGRES.stop(); }

  @Test
  void completesFullMarketplaceLifecycleAndWritesEventsAtomically() {
    var job = service.createJob(auth("customer-sub"), jobBody("Lifecycle job"));
    assertEquals("DRAFT", job.get("status"));
    UUID jobId = id(job);

    service.transition(auth("customer-sub"), jobId, "publish");
    var offer = service.createOffer(auth("provider-a-sub"), jobId, offerBody(50));
    service.offerAction(auth("customer-sub"), id(offer), "accept");
    assertEquals("ASSIGNED", service.customerJob(auth("customer-sub"), jobId).get("status"));

    service.providerTransition(auth("provider-a-sub"), jobId, "start");
    service.providerTransition(auth("provider-a-sub"), jobId, "finish");
    service.transition(auth("customer-sub"), jobId, "confirm");
    assertEquals("COMPLETED", service.customerJob(auth("customer-sub"), jobId).get("status"));

    assertEquals(List.of("job.created", "job.published", "offer.created", "offer.accepted", "job.assigned", "job.started", "job.awaiting_confirmation", "job.completed"), allEventTypes());
  }

  @Test
  void enforcesCancellationRules() {
    UUID draftId = id(service.createJob(auth("customer-sub"), jobBody("Draft cancellation")));
    service.transition(auth("customer-sub"), draftId, "cancel");
    assertEquals("CANCELLED", service.customerJob(auth("customer-sub"), draftId).get("status"));

    UUID openId = id(service.createJob(auth("customer-sub"), jobBody("Open cancellation")));
    service.transition(auth("customer-sub"), openId, "publish");
    service.transition(auth("customer-sub"), openId, "cancel");
    assertEquals("CANCELLED", service.customerJob(auth("customer-sub"), openId).get("status"));

    UUID completedId = id(service.createJob(auth("customer-sub"), jobBody("Completed cancellation")));
    service.transition(auth("customer-sub"), completedId, "publish");
    var offer = service.createOffer(auth("provider-a-sub"), completedId, offerBody(60));
    service.offerAction(auth("customer-sub"), id(offer), "accept");
    service.providerTransition(auth("provider-a-sub"), completedId, "start");
    service.providerTransition(auth("provider-a-sub"), completedId, "finish");
    service.transition(auth("customer-sub"), completedId, "confirm");
    var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.transition(auth("customer-sub"), completedId, "cancel"));
    assertEquals(409, error.getStatusCode().value());
  }

  @Test
  void supportsOfferEditAndWithdraw() {
    UUID jobId = id(service.createJob(auth("customer-sub"), jobBody("Offer operations")));
    service.transition(auth("customer-sub"), jobId, "publish");
    var offer = service.createOffer(auth("provider-a-sub"), jobId, offerBody(25));
    var edit = new LinkedHashMap<String, Object>();
    edit.put("price", 30);
    var updated = service.updateOffer(auth("provider-a-sub"), id(offer), edit);
    assertEquals(30, ((Number) updated.get("price")).intValue());
    assertEquals("WITHDRAWN", service.withdraw(auth("provider-a-sub"), id(offer)).get("status"));
  }

  @Test
  void competingAcceptancesHaveOneWinnerAndConsistentState() throws Exception {
    UUID jobId = id(service.createJob(auth("customer-sub"), jobBody("Competing offers")));
    service.transition(auth("customer-sub"), jobId, "publish");
    UUID offerA = id(service.createOffer(auth("provider-a-sub"), jobId, offerBody(40)));
    UUID offerB = id(service.createOffer(auth("provider-b-sub"), jobId, offerBody(45)));
    var start = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<?> first = executor.submit(() -> acceptWhenReleased(start, offerA));
      Future<?> second = executor.submit(() -> acceptWhenReleased(start, offerB));
      start.countDown();
      int successes = 0;
      for (Future<?> future : List.of(first, second)) {
        try { future.get(20, TimeUnit.SECONDS); successes++; } catch (ExecutionException ignored) { }
      }
      assertEquals(1, successes);
    } finally {
      executor.shutdownNow();
    }
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM offers WHERE job_id=? AND status='ACCEPTED'", Integer.class, jobId));
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM offers WHERE job_id=? AND status='REJECTED'", Integer.class, jobId));
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM jobs WHERE id=? AND status='ASSIGNED' AND assigned_provider_user_id IN (?, ?)", Integer.class, jobId, PROVIDER_A_ID, PROVIDER_B_ID));
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM domain_events WHERE aggregate_id=? AND event_type='job.assigned'", Integer.class, jobId));
  }

  @Test
  void failedTransactionRollsBackOfferAndOutboxChanges() {
    UUID jobId = id(service.createJob(auth("customer-sub"), jobBody("Rollback")));
    service.transition(auth("customer-sub"), jobId, "publish");
    UUID offerId = id(service.createOffer(auth("provider-a-sub"), jobId, offerBody(70)));
    service.withdraw(auth("provider-a-sub"), offerId);
    int eventsBefore = jdbc.queryForObject("SELECT count(*) FROM domain_events", Integer.class);

    var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> transactions.execute(status -> service.offerAction(auth("customer-sub"), offerId, "accept")));
    assertEquals(409, error.getStatusCode().value());
    assertEquals("WITHDRAWN", jdbc.queryForObject("SELECT status FROM offers WHERE id=?", String.class, offerId));
    assertEquals("OPEN", jdbc.queryForObject("SELECT status FROM jobs WHERE id=?", String.class, jobId));
    assertEquals(eventsBefore, jdbc.queryForObject("SELECT count(*) FROM domain_events", Integer.class));
  }

  private void acceptWhenReleased(CountDownLatch start, UUID offerId) {
    try {
      start.await();
      transactions.execute(status -> service.offerAction(auth("customer-sub"), offerId, "accept"));
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  private List<String> eventTypesFor(UUID aggregateId) { return jdbc.query("SELECT event_type FROM domain_events WHERE aggregate_id=? ORDER BY occurred_at,event_id", (row, number) -> row.getString(1), aggregateId); }
  private List<String> allEventTypes() { return jdbc.query("SELECT event_type FROM domain_events ORDER BY occurred_at,event_id", (row, number) -> row.getString(1)); }
  private void insertUser(UUID id, String subject, String name) { jdbc.update("INSERT INTO users(id,keycloak_subject_id,email,display_name) VALUES (?, ?, ?, ?)", id, subject, subject + "@example.test", name); }
  private void insertProvider(UUID id, String name) { jdbc.update("INSERT INTO provider_profiles(user_id,display_name,description,city,postal_code,service_radius_km,availability_status,years_experience,starting_price,currency,visibility) VALUES (?, ?, 'Services', 'Berlin', '10115', 10, 'AVAILABLE', 3, 20, 'EUR', 'PUBLIC')", id, name); }
  private Map<String, Object> jobBody(String title) { var body = new LinkedHashMap<String, Object>(); body.put("categoryId", CATEGORY_ID.toString()); body.put("title", title); body.put("description", "Marketplace test job"); body.put("city", "Berlin"); body.put("countryCode", "DE"); body.put("budgetType", "FIXED"); body.put("currency", "EUR"); body.put("postalCode", "10115"); body.put("budgetMin", 100); body.put("budgetMax", 100); body.put("preferredDate", null); body.put("preferredTimeText", null); return body; }
  private Map<String, Object> offerBody(int price) { var body = new LinkedHashMap<String, Object>(); body.put("price", price); body.put("currency", "EUR"); body.put("message", "I can help"); body.put("estimatedDuration", "2 hours"); body.put("availableFrom", null); return body; }
  private Authentication auth(String subject) { var authentication = mock(Authentication.class); var jwt = Jwt.withTokenValue(subject).header("alg", "none").subject(subject).claim("aud", List.of("helfio-web")).claim("email", subject + "@example.test").claim("name", subject).build(); when(authentication.getName()).thenReturn(subject); when(authentication.getPrincipal()).thenReturn(jwt); return authentication; }
  private UUID id(Map<String, Object> value) { return (UUID) value.get("id"); }
}
