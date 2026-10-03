package dev.ossm.api.library;

import dev.ossm.api.storage.Bucket;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {}

  private final JdbcClient jdbc;
  private final S3Client s3;
  private final Bucket bucket;

  LibraryController(JdbcClient jdbc, S3Client s3, Bucket bucket) {
    this.jdbc = jdbc;
    this.s3 = s3;
    this.bucket = bucket;
  }

  @Operation(operationId = "listTracks")
  @GetMapping("/tracks")
  List<Track> tracks() {
    return jdbc.sql(
            "select t.id, t.title, a.name as artist, al.title as album, t.album_id, al.cover_key,"
                + " al.dominant_color, t.license,"
                + " t.track_number, t.year, t.genre, t.duration_ms, t.codec, t.bitrate_kbps,"
                + " t.created_at from track t join artist a on a.id = t.artist_id"
                + " left join album al on al.id = t.album_id order by t.created_at desc, t.title")
        .query(
            (rs, i) -> {
              var albumId = rs.getObject("album_id", UUID.class);
              var hasCover = rs.getString("cover_key") != null;
              return new Track(
                  rs.getObject("id", UUID.class),
                  rs.getString("title"),
                  rs.getString("artist"),
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
                  rs.getObject("created_at", OffsetDateTime.class).toInstant());
            })
        .list();
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
