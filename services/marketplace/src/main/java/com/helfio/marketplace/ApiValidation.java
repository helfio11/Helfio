package com.helfio.marketplace;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class ApiValidation {
  private static final Set<String> CURRENCIES = Set.of("EUR", "USD", "GBP", "CHF");
  private static final Set<String> BUDGET_TYPES = Set.of("FIXED", "RANGE", "NEGOTIABLE");

  private ApiValidation() {}

  static void job(Map<String, Object> body, boolean partial) {
    requireBody(body);
    Set<String> allowed = Set.of("categoryId", "title", "description", "city", "countryCode", "budgetType", "currency", "postalCode", "budgetMin", "budgetMax", "preferredDate", "preferredTimeText");
    rejectUnknown(body, allowed);
    if (!partial) for (String key : List.of("categoryId", "title", "description", "city", "countryCode", "budgetType", "currency")) requireString(body, key);
    optionalString(body, "categoryId");
    optionalString(body, "title");
    optionalString(body, "description");
    optionalString(body, "city");
    optionalString(body, "countryCode");
    optionalString(body, "budgetType");
    optionalString(body, "currency");
    if (body.containsKey("title") && body.get("title") instanceof String value) { body.put("title", value.trim()); length(body, "title", 1, 160); }
    if (body.containsKey("description") && body.get("description") instanceof String value) { body.put("description", value.trim()); length(body, "description", 1, 4000); }
    if (body.containsKey("city") && body.get("city") instanceof String value) { body.put("city", value.trim()); length(body, "city", 1, 120); }
    if (body.containsKey("postalCode")) nullableString(body, "postalCode", 1, 20);
    if (body.containsKey("countryCode") && body.get("countryCode") instanceof String value) { body.put("countryCode", value.trim().toUpperCase(Locale.ROOT)); if (!((String) body.get("countryCode")).matches("[A-Z]{2}")) invalid("countryCode"); }
    if (body.containsKey("budgetType") && body.get("budgetType") instanceof String value && !BUDGET_TYPES.contains(value)) invalid("budgetType");
    if (body.containsKey("currency") && body.get("currency") instanceof String value) { body.put("currency", value.trim().toUpperCase(Locale.ROOT)); if (!CURRENCIES.contains(body.get("currency"))) invalid("currency"); }
    number(body, "budgetMin");
    number(body, "budgetMax");
    if (body.containsKey("budgetMin") && body.get("budgetMin") instanceof Number value && value.doubleValue() < 0) invalid("budgetMin");
    if (body.containsKey("budgetMax") && body.get("budgetMax") instanceof Number value && value.doubleValue() < 0) invalid("budgetMax");
    date(body, "preferredDate");
    nullableString(body, "preferredTimeText", 0, 120);
    if (!partial) {
      body.putIfAbsent("postalCode", null);
      body.putIfAbsent("budgetMin", null);
      body.putIfAbsent("budgetMax", null);
      body.putIfAbsent("preferredDate", null);
      body.putIfAbsent("preferredTimeText", null);
    }
    if (body.get("budgetMin") instanceof Number min && body.get("budgetMax") instanceof Number max && min.doubleValue() > max.doubleValue()) invalid("budget range");
  }

  static void offer(Map<String, Object> body, boolean partial) {
    requireBody(body);
    Set<String> allowed = Set.of("price", "currency", "message", "estimatedDuration", "availableFrom");
    rejectUnknown(body, allowed);
    if (!partial) for (String key : List.of("price", "currency", "message")) if (!body.containsKey(key)) invalid(key);
    number(body, "price");
    if (body.get("price") instanceof Number value && (value.doubleValue() < 0 || !Double.isFinite(value.doubleValue()))) invalid("price");
    if (body.containsKey("currency")) {
      requireString(body, "currency");
      body.put("currency", ((String) body.get("currency")).toUpperCase(Locale.ROOT));
      if (!CURRENCIES.contains(body.get("currency"))) invalid("currency");
    }
    if (body.containsKey("message")) {
      requireString(body, "message");
      String message = ((String) body.get("message")).trim();
      if (message.isEmpty() || ((String) body.get("message")).length() > 4000) invalid("message");
      body.put("message", message);
    }
    nullableString(body, "estimatedDuration", 0, 120);
    date(body, "availableFrom");
  }

  static void review(Map<String, Object> body) {
    requireBody(body);
    rejectUnknown(body, Set.of("rating", "comment"));
    if (!(body.get("rating") instanceof Integer rating) || rating < 1 || rating > 5) invalid("rating");
    if (body.containsKey("comment") && body.get("comment") != null) {
      requireString(body, "comment");
      if (((String) body.get("comment")).length() > 2000) invalid("comment");
      body.put("comment", ((String) body.get("comment")).trim());
      if (((String) body.get("comment")).isEmpty()) body.put("comment", null);
    }
  }

  private static void requireBody(Map<String, Object> body) { if (body == null) invalid("body"); }
  private static void rejectUnknown(Map<String, Object> body, Set<String> allowed) { if (body.keySet().stream().anyMatch(key -> !allowed.contains(key))) invalid("request"); }
  private static void requireString(Map<String, Object> body, String key) { if (!(body.get(key) instanceof String)) invalid(key); }
  private static void optionalString(Map<String, Object> body, String key) { if (body.containsKey(key) && body.get(key) != null && !(body.get(key) instanceof String)) invalid(key); }
  private static void nullableString(Map<String, Object> body, String key, int min, int max) { if (!body.containsKey(key) || body.get(key) == null) return; requireString(body, key); String value = ((String) body.get(key)).trim(); if (value.length() < min || value.length() > max) invalid(key); body.put(key, value); }
  private static void number(Map<String, Object> body, String key) { if (body.containsKey(key) && body.get(key) != null && (!(body.get(key) instanceof Number value) || !Double.isFinite(value.doubleValue()))) invalid(key); }
  private static void date(Map<String, Object> body, String key) { if (!body.containsKey(key) || body.get(key) == null) return; requireString(body, key); try { LocalDate.parse((String) body.get(key)); } catch (DateTimeParseException e) { invalid(key); } }
  private static void length(Map<String, Object> body, String key, int min, int max) { String value = (String) body.get(key); if (value.length() < min || value.length() > max) invalid(key); }
  private static void invalid(String key) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + key); }
}
