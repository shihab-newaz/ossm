package dev.ossm.api.ingest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin-only view of what went wrong with everyone's uploads. SecurityConfig guards /api/v1/admin.
 */
@RestController
@RequestMapping("/api/v1/admin")
class IngestAdminController {

  record IngestFailure(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID uploadId,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String filename,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String error,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String username,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant failedAt) {}

  private final JdbcClient jdbc;

  IngestAdminController(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Operation(operationId = "listIngestFailures")
  @GetMapping("/ingest-failures")
  List<IngestFailure> failures() {
    return jdbc.sql(
            "select u.id, u.filename, coalesce(u.error, 'Unknown error') as error, usr.username,"
                + " u.updated_at from upload u join users usr on usr.id = u.user_id"
                + " where u.status = 'FAILED' order by u.updated_at desc limit 100")
        .query(
            (rs, i) ->
                new IngestFailure(
                    rs.getObject("id", UUID.class),
                    rs.getString("filename"),
                    rs.getString("error"),
                    rs.getString("username"),
                    rs.getObject("updated_at", OffsetDateTime.class).toInstant()))
        .list();
  }
}
