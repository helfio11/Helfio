package com.helfio.marketplace;

import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiErrors {
  private static final Logger LOG = LoggerFactory.getLogger(ApiErrors.class);
  @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class}) ResponseEntity<Map<String,String>> denied(Exception e, HttpServletRequest request) { LOG.warn("api_error status=403 requestId={}", request.getAttribute("x-request-id")); return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Insufficient role")); }
  @ExceptionHandler(ResponseStatusException.class) ResponseEntity<Map<String,String>> status(ResponseStatusException e, HttpServletRequest request) { LOG.warn("api_error status={} requestId={}", e.getStatusCode().value(), request.getAttribute("x-request-id")); return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", e.getReason() == null ? "Request failed" : e.getReason())); }
  @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<Map<String,String>> malformed(HttpMessageNotReadableException e, HttpServletRequest request) { LOG.warn("api_error status=400 requestId={}", request.getAttribute("x-request-id")); return ResponseEntity.badRequest().body(Map.of("error", "Invalid JSON")); }
  @ExceptionHandler(Exception.class) ResponseEntity<Map<String,String>> internal(Exception e, HttpServletRequest request) { LOG.error("api_error status=500 requestId={} type={}", request.getAttribute("x-request-id"), e.getClass().getSimpleName()); return ResponseEntity.status(500).body(Map.of("error", "Internal server error")); }
}
