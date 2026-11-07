package dev.ossm.api.video;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The signed-in user's vault. Every query here is scoped to the session's user: a vault is private,
 * so nobody else sees it, admins included, and there is no way to ask for another one.
 */
@RestController
@RequestMapping("/api/v1/videos")
class VideosController {

  static final int DEFAULT_LIMIT = 50;
  static final int MAX_LIMIT = 200;

  record Video(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String description,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String originalFilename,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              allowableValues = {"MP4", "MOV", "WEBM", "MKV"})
          String container,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long sizeBytes,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {}

  record VideoPage(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Video> items,
      @Schema(description = "Pass as cursor to get the next page. Absent on the last page.")
          String nextCursor) {}

  private static final String COLUMNS =
      "id, title, description, original_filename, container, size_bytes, created_at";

  private static Video video(ResultSet rs, int row) throws SQLException {
    return new Video(
        rs.getObject("id", UUID.class),
        rs.getString("title"),
        rs.getString("description"),
        rs.getString("original_filename"),
        rs.getString("container"),
        rs.getLong("size_bytes"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant());
  }

  private final JdbcClient jdbc;
  private final CurrentUser currentUser;

  VideosController(JdbcClient jdbc, CurrentUser currentUser) {
    this.jdbc = jdbc;
    this.currentUser = currentUser;
  }

  @Operation(
      operationId = "listVideos",
      summary = "Your vault, newest first",
      description =
          "Only your own videos. Pages follow a cursor, not an offset, so a page never repeats or"
              + " skips a video even while uploads land: newest first, ties broken by id.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "One page of videos"),
    @ApiResponse(
        responseCode = "400",
        description = "A limit out of range, or a cursor that isn't one of ours",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping
  VideoPage list(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor,
      Authentication authentication) {
    var size = limit == null ? DEFAULT_LIMIT : limit;
    if (size < 1 || size > MAX_LIMIT) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT + ".");
    }
    var after = cursor == null ? null : Cursor.decode(cursor);
    var owner = currentUser.id(authentication);

    var sql = new StringBuilder("select " + COLUMNS + " from video where owner_id = :owner");
    if (after != null) {
      sql.append(" and (created_at, id) < (:createdAt, :id)");
    }
    // One more than asked for, to learn whether another page exists.
    sql.append(" order by created_at desc, id desc limit :limit");
    var statement = jdbc.sql(sql.toString()).param("owner", owner).param("limit", size + 1);
    if (after != null) {
      statement = statement.param("createdAt", after.createdAt()).param("id", after.id());
    }
    var rows = statement.query(VideosController::video).list();

    if (rows.size() <= size) {
      return new VideoPage(rows, null);
    }
    var items = rows.subList(0, size);
    var last = items.get(size - 1);
    return new VideoPage(items, Cursor.encode(last.createdAt(), last.id()));
  }

  @Operation(operationId = "getVideo", summary = "One of your videos")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The video"),
    @ApiResponse(
        responseCode = "404",
        description = "No such video in your vault",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{id}")
  Video get(@PathVariable UUID id, Authentication authentication) {
    // Someone else's video is a 404, not a 403, so its existence does not leak.
    return jdbc.sql("select " + COLUMNS + " from video where id = :id and owner_id = :owner")
        .param("id", id)
        .param("owner", currentUser.id(authentication))
        .query(VideosController::video)
        .optional()
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such video."));
  }

  /**
   * Where the next page starts: the last video of this one. Opaque to clients. Postgres keeps
   * microseconds, so that is the precision here; anything finer would never match a stored value.
   */
  private record Cursor(OffsetDateTime createdAt, UUID id) {

    static String encode(Instant createdAt, UUID id) {
      var micros = ChronoUnit.MICROS.between(Instant.EPOCH, createdAt);
      return Base64.getUrlEncoder()
          .withoutPadding()
          .encodeToString((micros + ":" + id).getBytes(StandardCharsets.UTF_8));
    }

    static Cursor decode(String cursor) {
      try {
        var text = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
        var colon = text.indexOf(':');
        var micros = Long.parseLong(text.substring(0, colon));
        var id = UUID.fromString(text.substring(colon + 1));
        return new Cursor(
            OffsetDateTime.ofInstant(Instant.EPOCH.plus(micros, ChronoUnit.MICROS), ZoneOffset.UTC),
            id);
      } catch (RuntimeException e) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That cursor isn't valid.");
      }
    }
  }
}
