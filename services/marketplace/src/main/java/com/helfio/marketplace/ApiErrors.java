package com.helfio.marketplace;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(ResponseStatusException.class) ResponseEntity<Map<String,String>> status(ResponseStatusException e) { return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", e.getReason() == null ? "Request failed" : e.getReason())); }
  @ExceptionHandler(Exception.class) ResponseEntity<Map<String,String>> internal(Exception e) { return ResponseEntity.status(500).body(Map.of("error", "Internal server error")); }
}
