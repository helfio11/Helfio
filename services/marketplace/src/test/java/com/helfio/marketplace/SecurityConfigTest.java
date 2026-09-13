package com.helfio.marketplace;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.jwt.Jwt;

class SecurityConfigTest {
  @Test
  void acceptsConfiguredAudienceAndRealmRole() {
    Jwt jwt = Jwt.withTokenValue("token")
        .header("alg", "none")
        .claim("aud", List.of("helfio-web"))
        .claim("realm_access", Map.of("roles", List.of("CUSTOMER")))
        .build();

    var authorities = new SecurityConfig().converter().convert(jwt).getAuthorities();

    assertTrue(authorities.contains(new SimpleGrantedAuthority("ROLE_CUSTOMER")));
  }

  @Test
  void rejectsTokenWithoutRequiredAudience() {
    Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").claim("aud", List.of("other-client")).build();

    assertThrows(OAuth2AuthenticationException.class, () -> new SecurityConfig().converter().convert(jwt));
  }
}