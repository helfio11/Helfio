package com.helfio.marketplace;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
public class HealthController {
  private final JdbcTemplate jdbc;

  public HealthController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  @GetMapping("/health/live")
  public Map<String, Object> live(jakarta.servlet.http.HttpServletRequest request) { return Map.of("data", Map.of("status", "ok", "requestId", request.getAttribute("x-request-id"))); }

  @GetMapping("/health/ready")
  public Map<String, Object> ready(jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
    boolean database;
    try { jdbc.queryForObject("SELECT 1", Integer.class); database = true; } catch (Exception e) { database = false; }
    boolean ready = database;
    response.setStatus(ready ? 200 : 503);
    return Map.of("data", Map.of("status", ready ? "ready" : "not_ready", "database", database, "eventWorker", true, "requestId", request.getAttribute("x-request-id")));
  }

  @GetMapping("/health/metrics")
  public Map<String, Object> metrics(jakarta.servlet.http.HttpServletRequest request) { return Map.of("data", Map.of("requests", 0, "errors", 0, "rateLimited", 0, "uptimeSeconds", 0, "requestId", request.getAttribute("x-request-id"))); }
}