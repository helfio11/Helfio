package com.helfio.marketplace;

import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
  @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.csrf(c -> c.disable()).authorizeHttpRequests(a -> a
      .requestMatchers("/actuator/health/**", "/actuator/info", "/health/**", "/api/v1/jobs/public/**", "/api/v1/providers/*/reviews", "/api/v1/providers/*/rating").permitAll()
      .anyRequest().authenticated())
      .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter())))
      .build();
  }

  @Bean JwtAuthenticationConverter converter() {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(this::authorities);
    return converter;
  }
  private Collection<GrantedAuthority> authorities(Jwt jwt) {
    String audience = System.getenv().getOrDefault("KEYCLOAK_AUDIENCE", "helfio-web");
    if (!jwt.getAudience().contains(audience)) {
      throw new OAuth2AuthenticationException(new OAuth2Error("invalid_token", "Required audience is missing", null));
    }
    var roles = new ArrayList<String>();
    Object realm = jwt.getClaim("realm_access");
    if (realm instanceof Map<?, ?> map && map.get("roles") instanceof Collection<?> values) values.forEach(v -> roles.add(String.valueOf(v)));
    Object resources = jwt.getClaim("resource_access");
    String clientId = System.getenv().getOrDefault("KEYCLOAK_CLIENT_ID", "helfio-web");
    if (resources instanceof Map<?, ?> map && map.get(clientId) instanceof Map<?, ?> client
      && client.get("roles") instanceof Collection<?> values) values.forEach(v -> roles.add(String.valueOf(v)));
    return roles.stream().map(r -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r)).toList();
  }
}
