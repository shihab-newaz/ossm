package dev.ossm.api.library;

import dev.ossm.api.storage.Bucket;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;

/** The shared library as the browser sees it. Every route needs a login. */
@RestController
@RequestMapping("/api/v1")
class LibraryController {

  record Track(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String artist,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID artistId,
      String album,
      UUID albumId,
      String coverUrl,
      String dominantColor,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String license,
      Integer trackNumber,
      Integer year,
      String genre,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long durationMs,
      String codec,
      Integer bitrateKbps,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String uploadedBy,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {}

  private final JdbcClient jdbc;
  private final S3Client s3;
  private final Bucket bucket;

  LibraryController(JdbcClient jdbc, S3Client s3, Bucket bucket) {
    this.jdbc = jdbc;
    this.s3 = s3;
    this.bucket = bucket;
  }

  /** Columns {@link #track} reads, from track t joined to artist a and (left) album al. */
  static final String TRACK_COLUMNS =
      "t.id, t.title, a.name as artist, t.artist_id, u.username as uploaded_by, al.title as album, t.album_id, al.cover_key,"
          + " al.dominant_color, t.license, t.track_number, t.year, t.genre, t.duration_ms,"
          + " t.codec, t.bitrate_kbps, t.created_at";

  static final String TRACK_JOINS =
      " from track t join artist a on a.id = t.artist_id join users u on u.id = t.uploader_id left join album al on al.id = t.album_id";

  static Track track(ResultSet rs) throws SQLException {
    var albumId = rs.getObject("album_id", UUID.class);
    var hasCover = rs.getString("cover_key") != null;
    return new Track(
        rs.getObject("id", UUID.class),
        rs.getString("title"),
        rs.getString("artist"),
        rs.getObject("artist_id", UUID.class),
        rs.getString("album"),
        albumId,
        hasCover ? "/api/v1/albums/" + albumId + "/cover" : null,
        rs.getString("dominant_color"),
        rs.getString("license"),
        (Integer) rs.getObject("track_number"),
        (Integer) rs.getObject("year"),
        rs.getString("genre"),
        rs.getLong("duration_ms"),
        rs.getString("codec"),
        (Integer) rs.getObject("bitrate_kbps"),
        rs.getString("uploaded_by"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant());
  }

  @Operation(
      operationId = "listTracks",
      summary = "Tracks in the shared library",
      description =
          "Everything unless limit and offset are given. Sorted by sort (added, newest first;"
              + " title; or artist), always with a stable tie-break, so pages never overlap or"
              + " skip. The total is in X-Total-Count.")
  @ApiResponses(
      @ApiResponse(
          responseCode = "200",
          description = "Tracks",
          headers = @Header(name = "X-Total-Count", schema = @Schema(type = "integer"))))
  @GetMapping("/tracks")
  ResponseEntity<List<Track>> tracks(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset,
      @RequestParam(defaultValue = "added")
          @Parameter(schema = @Schema(allowableValues = {"added", "title", "artist"}))
          String sort) {
    var order =
        switch (sort) {
          case "added" -> "t.created_at desc, t.title, t.id";
          case "title" -> "lower(t.title), t.title, t.id";
          case "artist" ->
              "lower(a.name), lower(al.title) nulls first, t.disc_number nulls last,"
                  + " t.track_number nulls last, lower(t.title), t.id";
          default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown sort.");
        };
    var total = jdbc.sql("select count(*) from track").query(Long.class).single();
    var query =
        "select "
            + TRACK_COLUMNS
            + TRACK_JOINS
            + " order by "
            + order
            + Paging.clause(limit, offset);
    var items = jdbc.sql(query).query((rs, i) -> track(rs)).list();
    return ResponseEntity.ok().header("X-Total-Count", String.valueOf(total)).body(items);
  }

  @Operation(operationId = "getAlbumCover")
  @ApiResponses({
    @ApiResponse(
        responseCode = "200",
        description = "The image",
        content =
            @Content(mediaType = "image/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "404",
        description = "No such album or no cover",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/albums/{id}/cover")
  ResponseEntity<byte[]> cover(@PathVariable UUID id) {
    var key =
        jdbc.sql("select cover_key from album where id = :id")
            .param("id", id)
            .query(String.class)
            .optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such cover."));
    var object = s3.getObjectAsBytes(b -> b.bucket(bucket.ensure()).key(key));
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(object.response().contentType()))
        // Content-addressed, so it never changes; private because the route needs a login.
        .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePrivate().immutable())
        .body(object.asByteArray());
  }
}
