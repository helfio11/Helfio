package com.helfio.marketplace;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class DomainEventsTest {
  @Test
  void writesTransactionalOutboxRecordWithExpectedContractFields() {
    var jdbc = mock(JdbcTemplate.class);
    var events = new DomainEvents(jdbc, new ObjectMapper());
    var aggregateId = UUID.randomUUID();

    events.append("job.created", aggregateId, Map.of("customerUserId", "customer", "recipientUserIds", List.of("customer")));

    verify(jdbc).update(contains("INSERT INTO domain_events"), any(), eq("job.created"), eq(aggregateId), any(), eq(1), contains("recipientUserIds"));
  }
}
