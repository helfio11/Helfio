package com.helfio.marketplace;

import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
  @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.csrf(c -> c.disable()).authorizeHttpRequests(a -> a
      .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
      .anyRequest().authenticated())
      .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter())))
      .build();
  }
  @Bean JwtAuthenticationConverter converter() {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(this::authorities);
    return converter;
  }
  private Collection<SimpleGrantedAuthority> authorities(Jwt jwt) {
    var roles = new ArrayList<String>();
    Object realm = jwt.getClaim("realm_access");
    if (realm instanceof Map<?, ?> map && map.get("roles") instanceof Collection<?> values) values.forEach(v -> roles.add(String.valueOf(v)));
    Object resources = jwt.getClaim("resource_access");
    if (resources instanceof Map<?, ?> map) map.values().forEach(client -> { if (client instanceof Map<?, ?> c && c.get("roles") instanceof Collection<?> values) values.forEach(v -> roles.add(String.valueOf(v))); });
    return roles.stream().map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList();
  }
}
