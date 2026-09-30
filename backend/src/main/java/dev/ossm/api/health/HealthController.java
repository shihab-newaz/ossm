package dev.ossm.api.health;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import javax.sql.DataSource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
class HealthController {

  private final DataSource dataSource;

  HealthController(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  record Health(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String database) {}

  @Operation(operationId = "getHealth")
  @GetMapping("/health")
  Health health() {
    return new Health("UP", databaseStatus());
  }

  private String databaseStatus() {
    try (var connection = dataSource.getConnection()) {
      return connection.isValid(2) ? "UP" : "DOWN";
    } catch (Exception e) {
      return "DOWN";
    }
  }
}
