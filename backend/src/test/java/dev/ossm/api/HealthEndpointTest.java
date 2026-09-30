package dev.ossm.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestConfiguration.class)
class HealthEndpointTest {

  @LocalServerPort int port;

  @Test
  void reportsApiAndDatabaseUp() throws Exception {
    var response = Http.get(port, "/api/v1/health");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).contains("\"status\":\"UP\"").contains("\"database\":\"UP\"");
  }
}
