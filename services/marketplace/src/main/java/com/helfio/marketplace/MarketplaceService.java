package com.helfio.marketplace;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MarketplaceService {
  private final JdbcTemplate jdbc; private final DomainEvents events;
  public MarketplaceService(JdbcTemplate jdbc, DomainEvents events) { this.jdbc = jdbc; this.events = events; }
  private UUID user(Authentication authentication) {
    try {
      String subject = authentication.getName();
      String email = null;
      String displayName = null;
      Object principal = authentication.getPrincipal();
      if (principal instanceof org.springframework.security.oauth2.jwt.Jwt jwt) {
        email = jwt.getClaimAsString("email");
        displayName = jwt.getClaimAsString("name");
        if (displayName == null) displayName = jwt.getClaimAsString("preferred_username");
      }
      var account = jdbc.queryForMap(
          "INSERT INTO users (keycloak_subject_id, email, display_name) VALUES (?, ?, ?) "
              + "ON CONFLICT (keycloak_subject_id) DO UPDATE SET "
              + "email = CASE WHEN users.anonymized_at IS NULL THEN EXCLUDED.email ELSE users.email END, "
              + "display_name = CASE WHEN users.anonymized_at IS NULL THEN EXCLUDED.display_name ELSE users.display_name END "
              + "RETURNING id, account_status",
          subject, email, displayName);
      if (!"ACTIVE".equals(String.valueOf(account.get("account_status")))) {
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is not active");
      }
      return (UUID) account.get("id");
    } catch (ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
    }
  }
  private static UUID uuid(String value) { try { return UUID.fromString(value); } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid id"); } }
  private static String text(Map<String,Object> body, String key) { Object v = body.get(key); if (!(v instanceof String s) || s.trim().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + key); return s.trim(); }
  private static Object value(Map<String,Object> body, String key) { return body.get(key); }
  private Map<String,Object> job(UUID id) {
    var rows = jdbc.queryForList("SELECT j.id,j.customer_user_id,j.category_id,j.title,j.description,j.city,j.postal_code,j.country_code,j.budget_type,j.budget_min,j.budget_max,j.currency,j.preferred_date,j.preferred_time_text,j.status,j.assigned_provider_user_id,j.created_at,j.updated_at,j.assigned_at,j.started_at,j.finished_at,j.completed_at,j.cancelled_at,c.parent_id category_parent_id,c.slug category_slug,c.status category_status,c.icon category_icon,c.sort_order category_sort_order,c.show_in_navigation category_show_in_navigation,c.show_on_homepage category_show_on_homepage,c.created_at category_created_at,c.updated_at category_updated_at FROM jobs j JOIN categories c ON c.id=j.category_id WHERE j.id=?", id);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found");
    var r = rows.getFirst(); var out = new LinkedHashMap<String,Object>();
    put(out,"id",r.get("id")); put(out,"customerUserId",r.get("customer_user_id")); put(out,"categoryId",r.get("category_id")); put(out,"title",r.get("title")); put(out,"description",r.get("description")); put(out,"city",r.get("city")); put(out,"postalCode",r.get("postal_code")); put(out,"countryCode",r.get("country_code")); put(out,"budgetType",r.get("budget_type")); put(out,"budgetMin",r.get("budget_min")); put(out,"budgetMax",r.get("budget_max")); put(out,"currency",r.get("currency")); put(out,"preferredDate",r.get("preferred_date")); put(out,"preferredTimeText",r.get("preferred_time_text")); put(out,"status",r.get("status")); put(out,"assignedProviderUserId",r.get("assigned_provider_user_id")); put(out,"createdAt",r.get("created_at")); put(out,"updatedAt",r.get("updated_at")); put(out,"assignedAt",r.get("assigned_at")); put(out,"startedAt",r.get("started_at")); put(out,"finishedAt",r.get("finished_at")); put(out,"completedAt",r.get("completed_at")); put(out,"cancelledAt",r.get("cancelled_at"));
    var category = new LinkedHashMap<String,Object>(); category.put("id", r.get("category_id")); category.put("parentId", r.get("category_parent_id")); category.put("slug", r.get("category_slug")); category.put("status", r.get("category_status")); category.put("icon", r.get("category_icon")); category.put("sortOrder", r.get("category_sort_order")); category.put("showInNavigation", r.get("category_show_in_navigation")); category.put("showOnHomepage", r.get("category_show_on_homepage")); category.put("createdAt", r.get("category_created_at")); category.put("updatedAt", r.get("category_updated_at")); category.put("translations", categoryTranslations((UUID) r.get("category_id"))); out.put("category", category); return out;
  }
  private Map<String,Object> categoryTranslations(UUID categoryId) {
    var translations = new LinkedHashMap<String,Object>();
    jdbc.queryForList("SELECT locale,name,description FROM category_translations WHERE category_id=?", categoryId).forEach(row -> { var translation = new LinkedHashMap<String,Object>(); translation.put("name", row.get("name")); translation.put("description", row.get("description")); translations.put(String.valueOf(row.get("locale")), translation); });
    return translations;
  }
  private static void put(Map<String,Object> out, String key, Object value) { if (value instanceof LocalDate d) out.put(key,d.toString()); else out.put(key,value); }
  private List<Map<String,Object>> jobsFor(String sql, Object... args) { return jdbc.queryForList(sql,args).stream().map(r -> job((UUID)r.get("id"))).toList(); }
  public List<Map<String,Object>> customerJobs(Authentication a) { return jobsFor("SELECT id FROM jobs WHERE customer_user_id=? ORDER BY updated_at DESC", user(a)); }
  public Map<String,Object> customerJob(Authentication a, UUID id) { var result = job(id); if (!Objects.equals(result.get("customerUserId"), user(a))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Job ownership required"); return result; }
  public Map<String,Object> publicJob(UUID id) { try { var result = job(id); if (!"OPEN".equals(result.get("status"))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Open job not found"); return providerView(result); } catch (ResponseStatusException e) { if (e.getStatusCode().equals(HttpStatus.NOT_FOUND)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Open job not found"); throw e; } }
  public Map<String,Object> providerOpenJob(UUID id) { return publicJob(id); }
  public Map<String,Object> providerView(Map<String,Object> value) { var safe = new LinkedHashMap<>(value); safe.remove("customerUserId"); return safe; }
  public List<Map<String,Object>> assignedJobs(Authentication a) { return jobsFor("SELECT id FROM jobs WHERE assigned_provider_user_id=? ORDER BY updated_at DESC", user(a)); }
  public List<Map<String,Object>> openJobs(String category, String city) { var sql="SELECT id FROM jobs WHERE status='OPEN'"; var args=new ArrayList<Object>(); if(category!=null&&!category.isBlank()){sql+=" AND category_id=?";args.add(uuid(category));} if(city!=null&&!city.isBlank()){sql+=" AND city ILIKE ?";args.add("%"+city+"%");} sql+=" ORDER BY updated_at DESC LIMIT 100"; return jobsFor(sql,args.toArray()); }
  @Transactional public Map<String,Object> createJob(Authentication a, Map<String,Object> b) { UUID customer=user(a), category=uuid(text(b,"categoryId")); if(jdbc.queryForObject("SELECT count(*) FROM categories WHERE id=? AND status='active'",Long.class,category)==0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid active category"); var id=UUID.randomUUID(); jdbc.update("INSERT INTO jobs(id,customer_user_id,category_id,title,description,city,postal_code,country_code,budget_type,budget_min,budget_max,currency,preferred_date,preferred_time_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,customer,category,text(b,"title"),text(b,"description"),text(b,"city"),value(b,"postalCode"),text(b,"countryCode").toUpperCase(),text(b,"budgetType"),value(b,"budgetMin"),value(b,"budgetMax"),text(b,"currency").toUpperCase(),value(b,"preferredDate"),value(b,"preferredTimeText")); events.append("job.created",id,Map.of("customerUserId",customer.toString(),"recipientUserIds",List.of(customer.toString()))); return job(id); }
  @Transactional public Map<String,Object> updateJob(Authentication a, UUID id, Map<String,Object> b) { UUID customer=user(a); Map<String,Object> current; try { current=jdbc.queryForMap("SELECT customer_user_id,status FROM jobs WHERE id=?",id); } catch (EmptyResultDataAccessException e) { throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Job not found"); } if(!Objects.equals(current.get("customer_user_id"),customer)) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Job ownership required"); if(!Set.of("DRAFT","OPEN").contains(String.valueOf(current.get("status")))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Job cannot be edited in this state"); var allowed=List.of("categoryId","title","description","city","postalCode","countryCode","budgetType","budgetMin","budgetMax","currency","preferredDate","preferredTimeText"); for(var key:allowed) if(b.containsKey(key)) jdbc.update("UPDATE jobs SET "+snake(key)+"=?,updated_at=now() WHERE id=?",b.get(key),id); return job(id); }
  private static String snake(String s){return s.replaceAll("([A-Z])","_$1").toLowerCase();}
  @Transactional public Map<String,Object> transition(Authentication a, UUID id, String action) { UUID customer=user(a); Map<String,Object> current; try { current=jdbc.queryForMap("SELECT status,customer_user_id,assigned_provider_user_id FROM jobs WHERE id=?",id); } catch (EmptyResultDataAccessException e) { throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Job not found"); } if(!customer.equals(current.get("customer_user_id"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Job ownership required"); String from=String.valueOf(current.get("status")); String to=switch(action){case "publish"->"OPEN";case "cancel"->"CANCELLED";case "confirm"->"COMPLETED";default->throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Not found");}; if(to.equals("OPEN")&&!from.equals("DRAFT")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid job transition"); if(to.equals("CANCELLED")&&!Set.of("DRAFT","OPEN","ASSIGNED").contains(from)||to.equals("COMPLETED")&&!from.equals("AWAITING_CONFIRMATION")) throw new ResponseStatusException(HttpStatus.CONFLICT,"Invalid job transition"); var updated=jdbc.update("UPDATE jobs SET status=?,cancelled_at=CASE WHEN ?='CANCELLED' THEN now() ELSE cancelled_at END,completed_at=CASE WHEN ?='COMPLETED' THEN now() ELSE completed_at END,updated_at=now() WHERE id=? AND status=?",to,to,to,id,from); if(updated!=1) throw new ResponseStatusException(HttpStatus.CONFLICT,"Invalid job transition"); if(to.equals("OPEN")) events.append("job.published",id,Map.of("customerUserId",customer.toString(),"title","job","recipientUserIds",List.of(customer.toString()))); if(to.equals("COMPLETED")) events.append("job.completed",id,Map.of("customerUserId",customer.toString(),"providerUserId",String.valueOf(current.get("assigned_provider_user_id")),"recipientUserIds",List.of(String.valueOf(current.get("assigned_provider_user_id"))))); return job(id); }
  @Transactional public Map<String,Object> providerTransition(Authentication a, UUID id, String action) { UUID provider=user(a); String to=action.equals("start")?"IN_PROGRESS":"AWAITING_CONFIRMATION"; String from=action.equals("start")?"ASSIGNED":"IN_PROGRESS"; Map<String,Object> row; try { row=jdbc.queryForMap("SELECT customer_user_id,assigned_provider_user_id,status FROM jobs WHERE id=? FOR UPDATE",id); } catch (EmptyResultDataAccessException e) { throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Job not found"); } if(!provider.equals(row.get("assigned_provider_user_id"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Job assignment required"); if(!from.equals(String.valueOf(row.get("status")))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Invalid job transition"); jdbc.update("UPDATE jobs SET status=?,started_at=CASE WHEN ?='IN_PROGRESS' THEN now() ELSE started_at END,finished_at=CASE WHEN ?='AWAITING_CONFIRMATION' THEN now() ELSE finished_at END,updated_at=now() WHERE id=?",to,to,to,id); String eventType=to.equals("IN_PROGRESS")?"job.started":"job.awaiting_confirmation"; events.append(eventType,id,Map.of("customerUserId",String.valueOf(row.get("customer_user_id")),"providerUserId",provider.toString(),"recipientUserIds",List.of(String.valueOf(row.get("customer_user_id"))))); return job(id); }
  private static final String OFFER_SELECT = "SELECT id,job_id,provider_user_id,price,currency,message,estimated_duration,available_from,status,created_at,updated_at FROM offers WHERE id=?";
  public List<Map<String,Object>> offersForJob(Authentication a, UUID jobId) { UUID customer=user(a); UUID owner; try { owner=jdbc.queryForObject("SELECT customer_user_id FROM jobs WHERE id=?",UUID.class,jobId); } catch (EmptyResultDataAccessException e) { throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Job not found"); } if(!customer.equals(owner)) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Job ownership required"); return jdbc.queryForList("SELECT id FROM offers WHERE job_id=? ORDER BY created_at",jobId).stream().map(row -> offerView((UUID) row.get("id"))).toList(); }
  public List<Map<String,Object>> offersForProvider(Authentication a) { return jdbc.queryForList("SELECT id FROM offers WHERE provider_user_id=? ORDER BY updated_at DESC",user(a)).stream().map(row -> offerView((UUID) row.get("id"))).toList(); }
  @Transactional public Map<String,Object> createOffer(Authentication a, UUID jobId, Map<String,Object> b) { UUID provider=user(a), id=UUID.randomUUID(); UUID customer; try { customer=jdbc.queryForObject("SELECT j.customer_user_id FROM jobs j JOIN provider_profiles p ON p.user_id=? WHERE j.id=? AND j.status='OPEN' AND j.customer_user_id<>?",UUID.class,provider,jobId,provider); } catch (EmptyResultDataAccessException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Offer cannot be submitted"); } if (jdbc.queryForObject("SELECT count(*) FROM offers WHERE job_id=? AND provider_user_id=? AND status IN ('PENDING','ACCEPTED')",Long.class,jobId,provider) > 0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Duplicate active offer"); jdbc.update("INSERT INTO offers(id,job_id,provider_user_id,price,currency,message,estimated_duration,available_from) VALUES (?,?,?,?,?,?,?,?)",id,jobId,provider,b.get("price"),text(b,"currency").toUpperCase(),text(b,"message"),value(b,"estimatedDuration"),value(b,"availableFrom")); events.append("offer.created",id,Map.of("jobId",jobId.toString(),"providerUserId",provider.toString(),"customerUserId",customer.toString(),"recipientUserIds",List.of(customer.toString()))); return offerView(id); }

  private Map<String,Object> offerView(UUID id) {
    var row = jdbc.queryForMap(OFFER_SELECT, id);
    var out = new LinkedHashMap<String,Object>();
    put(out, "id", row.get("id")); put(out, "jobId", row.get("job_id")); put(out, "price", row.get("price")); put(out, "currency", row.get("currency")); put(out, "message", row.get("message")); put(out, "estimatedDuration", row.get("estimated_duration")); put(out, "availableFrom", row.get("available_from")); put(out, "status", row.get("status")); put(out, "createdAt", row.get("created_at")); put(out, "updatedAt", row.get("updated_at")); out.put("provider", publicProvider((UUID) row.get("provider_user_id"))); return out;
  }

  private Map<String,Object> publicProvider(UUID userId) {
    var rows = jdbc.queryForList("SELECT user_id,display_name,description,profile_image_ref,city,postal_code,service_radius_km,availability_status,years_experience,starting_price,currency FROM provider_profiles WHERE user_id=? AND visibility='PUBLIC'", userId);
    if (rows.isEmpty()) return null;
    var row = rows.getFirst(); var out = new LinkedHashMap<String,Object>();
    put(out, "userId", row.get("user_id")); put(out, "displayName", row.get("display_name")); put(out, "description", row.get("description")); put(out, "profileImageRef", row.get("profile_image_ref")); put(out, "city", row.get("city")); put(out, "postalCode", row.get("postal_code")); put(out, "serviceRadiusKm", row.get("service_radius_km")); put(out, "availabilityStatus", row.get("availability_status")); put(out, "yearsExperience", row.get("years_experience")); put(out, "startingPrice", row.get("starting_price")); put(out, "currency", row.get("currency")); out.put("services", providerServices(userId)); return out;
  }

  private List<Map<String,Object>> providerServices(UUID userId) {
    return jdbc.queryForList("SELECT c.id,c.slug,c.icon,COALESCE(jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'description',t.description)) FILTER (WHERE t.locale IS NOT NULL),'{}'::jsonb) translations FROM provider_services ps JOIN categories c ON c.id=ps.category_id LEFT JOIN category_translations t ON t.category_id=c.id WHERE ps.provider_user_id=? GROUP BY c.id ORDER BY c.sort_order,c.slug", userId).stream().map(row -> { Map<String,Object> service = new LinkedHashMap<>(); service.put("id", row.get("id")); service.put("slug", row.get("slug")); service.put("icon", row.get("icon")); service.put("translations", row.get("translations")); return service; }).toList();
  }
  @Transactional
  public Map<String, Object> offerAction(Authentication authentication, UUID id, String action) {
    UUID customer = user(authentication);
    Map<String,Object> offer;
    try {
      offer = jdbc.queryForMap(
        "SELECT o.job_id, o.provider_user_id, j.customer_user_id "
          + "FROM offers o JOIN jobs j ON j.id = o.job_id "
          + "WHERE o.id = ? AND j.customer_user_id = ? FOR UPDATE",
        id, customer);
    } catch (EmptyResultDataAccessException e) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Offer ownership required");
    }

    if (action.equals("accept")) {
      jdbc.queryForMap("SELECT id FROM jobs WHERE id = ? AND status = 'OPEN' FOR UPDATE", offer.get("job_id"));
      if (jdbc.update("UPDATE offers SET status = 'ACCEPTED', updated_at = now() WHERE id = ? AND status = 'PENDING'", id) != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid offer transition");
      jdbc.update("UPDATE offers SET status = 'REJECTED', updated_at = now() WHERE job_id = ? AND id <> ? AND status = 'PENDING'", offer.get("job_id"), id);
      jdbc.update("UPDATE jobs SET status = 'ASSIGNED', assigned_provider_user_id = ?, assigned_at = now(), updated_at = now() WHERE id = ? AND status = 'OPEN'", offer.get("provider_user_id"), offer.get("job_id"));
      events.append("offer.accepted", id, Map.of("jobId", String.valueOf(offer.get("job_id")), "providerUserId", String.valueOf(offer.get("provider_user_id")), "customerUserId", customer.toString(), "recipientUserIds", List.of(String.valueOf(offer.get("provider_user_id")))));
      events.append("job.assigned", (UUID) offer.get("job_id"), Map.of("jobId", String.valueOf(offer.get("job_id")), "providerUserId", String.valueOf(offer.get("provider_user_id")), "customerUserId", customer.toString(), "recipientUserIds", List.of(String.valueOf(offer.get("provider_user_id")))));
    } else {
      if (jdbc.update("UPDATE offers SET status = 'REJECTED', updated_at = now() WHERE id = ? AND status = 'PENDING'", id) != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid offer transition");
    }

    return offerView(id);
  }
  @Transactional public Map<String,Object> withdraw(Authentication a, UUID id) { UUID provider=user(a); if (jdbc.update("UPDATE offers SET status='WITHDRAWN',updated_at=now() WHERE id=? AND provider_user_id=? AND status='PENDING'",id,provider) != 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid offer transition"); return offerView(id); }
  @Transactional public Map<String,Object> updateOffer(Authentication a, UUID id, Map<String,Object> b) { UUID provider=user(a); int changed=jdbc.update("UPDATE offers SET price=COALESCE(?,price),currency=COALESCE(?,currency),message=COALESCE(?,message),estimated_duration=COALESCE(?,estimated_duration),available_from=COALESCE(?,available_from),updated_at=now() WHERE id=? AND provider_user_id=? AND status='PENDING'",b.get("price"),b.get("currency"),b.get("message"),b.get("estimatedDuration"),b.get("availableFrom"),id,provider); if(changed!=1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid offer transition"); return offerView(id); }
  @Transactional public Map<String,Object> review(Authentication a, UUID jobId, Map<String,Object> b) { UUID customer=user(a); UUID provider; try { provider=jdbc.queryForObject("SELECT assigned_provider_user_id FROM jobs WHERE id=? AND customer_user_id=? AND status='COMPLETED' AND assigned_provider_user_id IS NOT NULL AND assigned_provider_user_id<>?",UUID.class,jobId,customer,customer); } catch (EmptyResultDataAccessException e) { throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Review not allowed"); } if (jdbc.queryForObject("SELECT count(*) FROM reviews WHERE job_id=? AND provider_user_id=?",Long.class,jobId,provider) > 0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Duplicate review"); UUID id=UUID.randomUUID(); jdbc.update("INSERT INTO reviews(id,job_id,customer_user_id,provider_user_id,rating,comment) VALUES (?,?,?,?,?,?)",id,jobId,customer,provider,b.get("rating"),b.get("comment")); events.append("review.created",id,Map.of("jobId",jobId.toString(),"providerUserId",provider.toString(),"recipientUserIds",List.of(provider.toString()))); var row=jdbc.queryForMap("SELECT r.id,r.rating,r.comment,r.created_at,r.updated_at,u.display_name reviewer_display_name FROM reviews r JOIN users u ON u.id=r.customer_user_id WHERE r.id=?",id); var out=new LinkedHashMap<String,Object>(); put(out,"id",row.get("id")); put(out,"rating",row.get("rating")); put(out,"comment",row.get("comment")); put(out,"reviewerDisplayName",row.get("reviewer_display_name")); put(out,"createdAt",row.get("created_at")); put(out,"updatedAt",row.get("updated_at")); return out; }

  public List<Map<String,Object>> publicReviews(UUID providerId) {
    if (publicProvider(providerId) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found");
    return jdbc.queryForList("SELECT r.id,r.rating,r.comment,r.created_at,r.updated_at,u.display_name reviewer_display_name FROM reviews r JOIN users u ON u.id=r.customer_user_id WHERE r.provider_user_id=? AND r.moderation_status='VISIBLE' ORDER BY r.created_at DESC", providerId).stream().map(row -> { var out=new LinkedHashMap<String,Object>(); put(out,"id",row.get("id")); put(out,"rating",row.get("rating")); put(out,"comment",row.get("comment")); put(out,"reviewerDisplayName",row.get("reviewer_display_name")); put(out,"createdAt",row.get("created_at")); put(out,"updatedAt",row.get("updated_at")); return (Map<String,Object>) out; }).toList();
  }

  public Map<String,Object> providerRating(UUID providerId) {
    if (publicProvider(providerId) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found");
    var row=jdbc.queryForMap("SELECT ROUND(AVG(rating)::numeric,1)::float average_rating,count(*)::int review_count FROM reviews WHERE provider_user_id=? AND moderation_status='VISIBLE'", providerId);
    var result = new LinkedHashMap<String,Object>(); result.put("averageRating", row.get("average_rating")); result.put("reviewCount", row.get("review_count")); return result;
  }
}
