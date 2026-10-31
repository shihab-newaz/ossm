package dev.ossm.api.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * springdoc serves the OpenAPI document at /api/v3/api-docs so it is reachable through the proxy,
 * which only routes /api to this app. The conventional /v3/api-docs is kept as a server-side
 * forward for the contract test and for tools that expect the default location.
 */
@Configuration
class ApiDocsConfig implements WebMvcConfigurer {

  @Override
  public void addViewControllers(ViewControllerRegistry registry) {
    registry.addViewController("/v3/api-docs").setViewName("forward:/api/v3/api-docs");
  }

  /**
   * Same title and server as contract/openapi.yaml: the page's own origin. Without this springdoc
   * writes the URL it was reached on (plain http behind Caddy), and Swagger UI would call that
   * instead.
   */
  @Bean
  OpenAPI openApi() {
    return new OpenAPI()
        .info(new Info().title("OSSM API").version("0.1.0"))
        .servers(List.of(new Server().url("/")));
  }
}
