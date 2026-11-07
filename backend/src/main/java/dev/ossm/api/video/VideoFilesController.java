package dev.ossm.api.video;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.storage.ObjectResponses;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Plays and downloads the original of a video in the signed-in user's vault (ADR 0006, extended).
 * The owner check comes first and a video that is not yours is a 404, the same as one that does not
 * exist, so nothing about someone else's vault can be learned from here.
 */
@RestController
@RequestMapping("/api/v1/videos")
class VideoFilesController {

  private record Stored(String key, long size, String container, String filename) {}

  private final JdbcClient jdbc;
  private final CurrentUser currentUser;
  private final ObjectResponses objects;

  VideoFilesController(JdbcClient jdbc, CurrentUser currentUser, ObjectResponses objects) {
    this.jdbc = jdbc;
    this.currentUser = currentUser;
    this.objects = objects;
  }

  @Operation(
      operationId = "streamVideo",
      summary = "Play the original",
      description =
          "The stored file as uploaded, with byte-range support so seeking is quick. Only the"
              + " owner can ask for it.")
  @ApiResponses({
    @ApiResponse(
        responseCode = "200",
        description = "The whole file",
        content =
            @Content(mediaType = "video/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "206",
        description = "The requested byte range",
        content =
            @Content(mediaType = "video/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video in your vault, or its file is missing from storage",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(responseCode = "416", description = "The range starts beyond the end of the file")
  })
  @GetMapping("/{id}/stream")
  ResponseEntity<StreamingResponseBody> stream(
      @PathVariable UUID id,
      @RequestHeader(value = HttpHeaders.RANGE, required = false) String range,
      Authentication authentication) {
    var stored = owned(id, authentication);
    return objects.serve(
        stored.key(),
        stored.size(),
        contentType(stored.container()),
        range,
        // Private to this login, and always asked about again: a browser shared by two people
        // must not play one person's video from its cache for the other.
        CacheControl.noCache().cachePrivate(),
        null,
        "The video file is missing.");
  }

  @Operation(
      operationId = "downloadVideo",
      summary = "Download the original",
      description =
          "The stored file byte for byte, as an attachment under its original file name. Only the"
              + " owner can ask for it.")
  @ApiResponses({
    @ApiResponse(
        responseCode = "200",
        description = "The whole file",
        content =
            @Content(mediaType = "video/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "206",
        description = "The requested byte range, so an interrupted download can resume",
        content =
            @Content(mediaType = "video/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video in your vault, or its file is missing from storage",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(responseCode = "416", description = "The range starts beyond the end of the file")
  })
  @GetMapping("/{id}/download")
  ResponseEntity<StreamingResponseBody> download(
      @PathVariable UUID id,
      @RequestHeader(value = HttpHeaders.RANGE, required = false) String range,
      Authentication authentication) {
    var stored = owned(id, authentication);
    var headers = new HttpHeaders();
    headers.set(HttpHeaders.CONTENT_DISPOSITION, ContentDispositions.attachment(stored.filename()));
    return objects.serve(
        stored.key(),
        stored.size(),
        contentType(stored.container()),
        range,
        CacheControl.noCache().cachePrivate(),
        headers,
        "The video file is missing.");
  }

  private Stored owned(UUID id, Authentication authentication) {
    return jdbc.sql(
            "select object_key, size_bytes, container, original_filename from video"
                + " where id = :id and owner_id = :owner")
        .param("id", id)
        .param("owner", currentUser.id(authentication))
        .query(
            (rs, i) ->
                new Stored(
                    rs.getString("object_key"),
                    rs.getLong("size_bytes"),
                    rs.getString("container"),
                    rs.getString("original_filename")))
        .optional()
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such video."));
  }

  /** From the container recorded at ingest, never from the file name. */
  private static MediaType contentType(String container) {
    return switch (container) {
      case "MP4" -> MediaType.parseMediaType("video/mp4");
      case "MOV" -> MediaType.parseMediaType("video/quicktime");
      case "WEBM" -> MediaType.parseMediaType("video/webm");
      case "MKV" -> MediaType.parseMediaType("video/x-matroska");
      default -> MediaType.APPLICATION_OCTET_STREAM;
    };
  }
}
