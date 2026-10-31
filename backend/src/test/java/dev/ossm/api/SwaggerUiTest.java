package dev.ossm.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/** Swagger UI and everything it loads sit under /api, the only prefix Caddy sends to the API. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class SwaggerUiTest {

  @LocalServerPort int port;

  @Test
  void docsPathRedirectsToTheUiUnderApi() throws Exception {
    var response = Http.get(port, "/api/docs");

    assertThat(response.statusCode()).isEqualTo(302);
    assertThat(response.headers().firstValue("Location"))
        .hasValueSatisfying(
            location -> assertThat(location).endsWith("/api/swagger-ui/index.html"));
  }

  @Test
  void uiPageIsServedWithoutASession() throws Exception {
    var response = Http.get(port, "/api/swagger-ui/index.html");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).contains("swagger-ui");
  }

  @Test
  void uiConfigPointsAtTheDocumentUnderApi() throws Exception {
    var initializer = Http.get(port, "/api/swagger-ui/swagger-initializer.js");
    assertThat(initializer.statusCode()).isEqualTo(200);
    assertThat(initializer.body()).contains("/api/v3/api-docs/swagger-config");

    var config = Http.get(port, "/api/v3/api-docs/swagger-config");
    assertThat(config.statusCode()).isEqualTo(200);
    assertThat(config.body()).contains("\"url\":\"/api/v3/api-docs\"");
  }

  @Test
  void documentIsServedAtBothLocations() throws Exception {
    var underApi = Http.get(port, "/api/v3/api-docs");
    var conventional = Http.get(port, "/v3/api-docs");

    assertThat(underApi.statusCode()).isEqualTo(200);
    assertThat(conventional.statusCode()).isEqualTo(200);
    assertThat(conventional.body()).isEqualTo(underApi.body());
    // Relative, as in the contract, so "Try it out" calls the origin the page was loaded from.
    assertThat(underApi.body()).contains("\"servers\":[{\"url\":\"/\"}]");
  }
}
