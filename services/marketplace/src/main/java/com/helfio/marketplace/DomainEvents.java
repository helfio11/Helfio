package com.helfio.marketplace;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DomainEvents {
  private final JdbcTemplate jdbc; private final ObjectMapper json;
  public DomainEvents(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }
  public void append(String type, UUID aggregateId, Map<String, Object> payload) {
    try {
      jdbc.update("INSERT INTO domain_events(event_id,event_type,aggregate_id,occurred_at,version,payload) VALUES (?,?,?,?,?,?::jsonb)", UUID.randomUUID(), type, aggregateId, Instant.now(), 1, json.writeValueAsString(payload));
    } catch (JsonProcessingException e) { throw new IllegalStateException("event serialization failed", e); }
  }
}
