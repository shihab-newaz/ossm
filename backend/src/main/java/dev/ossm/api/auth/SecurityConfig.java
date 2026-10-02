package dev.ossm.api.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

@Configuration
class SecurityConfig {

  /** argon2id, with the OWASP-recommended minimum cost: 19 MiB memory, 2 iterations, 1 lane. */
  @Bean
  PasswordEncoder passwordEncoder() {
    return new Argon2PasswordEncoder(16, 32, 1, 19_456, 2);
  }

  @Bean
  SecurityContextRepository securityContextRepository() {
    return new HttpSessionSecurityContextRepository();
  }

  /**
   * Login is handled by our own controller, so there is no username/password provider to configure.
   * Declaring this keeps Boot from generating a throwaway user and logging its password.
   */
  @Bean
  UserDetailsService noUserDetailsService() {
    return username -> {
      throw new UsernameNotFoundException("not used");
    };
  }

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http, SecurityContextRepository contextRepository, ProblemWriter problems)
      throws Exception {
    return http
        // The API is JSON-only on a single origin and the session cookie is SameSite=Lax, so a
        // cross-site form post cannot carry the session. See ADR 0004.
        .csrf(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        // Nothing to redirect back to in a JSON API; the default would create a session per 401.
        .requestCache(AbstractHttpConfigurer::disable)
        .securityContext(context -> context.securityContextRepository(contextRepository))
        .authorizeHttpRequests(
            requests ->
                requests
                    .requestMatchers(
                        "/api/v1/health", "/v3/api-docs", "/v3/api-docs/**", "/actuator/health/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/setup")
                    .permitAll()
                    .requestMatchers(
                        HttpMethod.POST,
                        "/api/v1/setup",
                        "/api/v1/auth/login",
                        "/api/v1/auth/logout")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/invites/*")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/v1/invites/*/accept")
                    .permitAll()
                    .requestMatchers("/api/v1/users", "/api/v1/users/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            exceptions ->
                exceptions
                    .authenticationEntryPoint(problems::unauthorized)
                    .accessDeniedHandler(problems::forbidden))
        .build();
  }
}
