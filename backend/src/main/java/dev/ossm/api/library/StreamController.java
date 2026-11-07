package dev.ossm.api.library;

import dev.ossm.api.storage.ObjectResponses;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Plays a track: the bytes come from the private object store through the API, so the store never
 * needs to be reachable by the browser and every read is behind the login.
 */
@RestController
@RequestMapping("/api/v1")
class StreamController {

  private record Stored(String key, long size) {}

  private final JdbcClient jdbc;
  private final ObjectResponses objects;

  StreamController(JdbcClient jdbc, ObjectResponses objects) {
    this.jdbc = jdbc;
    this.objects = objects;
  }

  @Operation(operationId = "streamTrack")
  @ApiResponses({
    @ApiResponse(
        responseCode = "200",
        description = "The whole file",
        content =
            @Content(mediaType = "audio/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "206",
        description = "The requested byte range",
        content =
            @Content(mediaType = "audio/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "404",
        description = "No such track, or its file is missing from storage",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(responseCode = "416", description = "The range starts beyond the end of the file")
  })
  @GetMapping("/tracks/{id}/stream")
  ResponseEntity<StreamingResponseBody> stream(
      @PathVariable UUID id,
      @RequestHeader(value = HttpHeaders.RANGE, required = false) String range) {
    var stored =
        jdbc.sql("select object_key, size_bytes from track where id = :id")
            .param("id", id)
            .query((rs, i) -> new Stored(rs.getString("object_key"), rs.getLong("size_bytes")))
            .optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such track."));
    return objects.serve(
        stored.key(),
        stored.size(),
        contentType(stored.key()),
        range,
        // The file behind a track id never changes; private because the route needs a login.
        CacheControl.maxAge(Duration.ofDays(1)).cachePrivate(),
        null,
        "The audio file is missing.");
  }

  private static MediaType contentType(String key) {
    var dot = key.lastIndexOf('.');
    var extension = dot < 0 ? "" : key.substring(dot + 1).toLowerCase(Locale.ROOT);
    return switch (extension) {
      case "mp3" -> MediaType.parseMediaType("audio/mpeg");
      case "flac" -> MediaType.parseMediaType("audio/flac");
      case "m4a" -> MediaType.parseMediaType("audio/mp4");
      case "ogg", "opus" -> MediaType.parseMediaType("audio/ogg");
      case "wav" -> MediaType.parseMediaType("audio/wav");
      default -> MediaType.APPLICATION_OCTET_STREAM;
    };
  }
}
