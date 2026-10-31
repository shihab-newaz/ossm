package dev.ossm.api.video;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.storage.Bucket;
import dev.ossm.api.storage.ObjectStreamer;
import dev.ossm.api.video.VideoDtos.Subtitle;
import dev.ossm.api.video.VideoDtos.Video;
import dev.ossm.api.video.VideoDtos.VideoDetail;
import dev.ossm.api.video.VideoDtos.VideoKind;
import dev.ossm.api.video.VideoDtos.VideoUpdate;
import dev.ossm.api.video.VideoDtos.WatchProgress;
import dev.ossm.api.video.VideoDtos.WatchProgressRequest;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/** The video library (spec 03): browsing, playing, subtitles and watch progress. Login required. */
@RestController
@RequestMapping("/api/v1/videos")
class VideosController {

  private static final int MAX_LIMIT = 1000;
  private static final long MAX_SUBTITLE_BYTES = 2L * 1024 * 1024;

  /**
   * Watched at 90%, or with under 2 minutes left once half is behind (web/src/video/progress.ts).
   */
  private static final long WATCHED_REMAINING_MS = 120_000;

  private final VideoQueries queries;
  private final JdbcClient jdbc;
  private final S3Client s3;
  private final Bucket bucket;
  private final ObjectStreamer streamer;
  private final CurrentUser currentUser;
  private final TransactionTemplate transaction;

  VideosController(
      VideoQueries queries,
      JdbcClient jdbc,
      S3Client s3,
      Bucket bucket,
      ObjectStreamer streamer,
      CurrentUser currentUser,
      TransactionTemplate transaction) {
    this.queries = queries;
    this.jdbc = jdbc;
    this.s3 = s3;
    this.bucket = bucket;
    this.streamer = streamer;
    this.currentUser = currentUser;
    this.transaction = transaction;
  }

  static String paging(Integer limit, Integer offset) {
    if (limit != null && (limit < 1 || limit > MAX_LIMIT)) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT + ".");
    }
    if (offset != null && offset < 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "offset cannot be negative.");
    }
    return (limit == null ? "" : " limit " + limit)
        + (offset == null || offset == 0 ? "" : " offset " + offset);
  }

  static int sectionLimit(Integer limit) {
    if (limit == null) {
      return 50;
    }
    if (limit < 1 || limit > 200) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 200.");
    }
    return limit;
  }

  @Operation(operationId = "listVideos", summary = "Videos in the shared library")
  @ApiResponses(
      @ApiResponse(
          responseCode = "200",
          description = "Videos",
          headers = @Header(name = "X-Total-Count", description = "How many there are in all")))
  @GetMapping
  ResponseEntity<List<Video>> list(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset,
      @RequestParam(defaultValue = "MOVIE") VideoKind kind,
      @RequestParam(defaultValue = "added") String sort,
      Authentication authentication) {
    var me = currentUser.id(authentication);
    var videos = queries.list(me, kind, sort, paging(limit, offset));
    return ResponseEntity.ok()
        .header("X-Total-Count", Long.toString(queries.count(kind)))
        .body(videos);
  }

  @Operation(operationId = "listRecentVideos", summary = "The newest movies and episodes")
  @ApiResponses(@ApiResponse(responseCode = "200", description = "Videos"))
  @GetMapping("/recent")
  List<Video> recent(@RequestParam(required = false) Integer limit, Authentication authentication) {
    return queries.recent(currentUser.id(authentication), sectionLimit(limit));
  }

  @Operation(operationId = "listContinueWatching", summary = "Your videos in progress")
  @ApiResponses(@ApiResponse(responseCode = "200", description = "Videos with your progress"))
  @GetMapping("/continue-watching")
  List<Video> continueWatching(
      @RequestParam(required = false) Integer limit, Authentication authentication) {
    return queries.continueWatching(currentUser.id(authentication), sectionLimit(limit));
  }

  @Operation(operationId = "getVideo", summary = "A video, its subtitles and what to watch next")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The video"),
    @ApiResponse(
        responseCode = "404",
        description = "No such video",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{id}")
  VideoDetail get(@PathVariable UUID id, Authentication authentication) {
    var me = currentUser.id(authentication);
    var video = queries.find(me, id).orElseThrow(VideosController::noSuchVideo);
    return new VideoDetail(
        video, queries.subtitles(id), queries.upNext(me, video), canEdit(authentication, me, id));
  }

  @Operation(operationId = "updateVideo", summary = "Correct a video's details")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The updated video"),
    @ApiResponse(
        responseCode = "400",
        description = "Invalid details",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "403",
        description = "You did not upload this video and are not an admin",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PatchMapping("/{id}")
  Video update(
      @PathVariable UUID id, @Valid @RequestBody VideoUpdate body, Authentication authentication) {
    var me = currentUser.id(authentication);
    if (queries.uploader(id).isEmpty()) {
      throw noSuchVideo();
    }
    if (!canEdit(authentication, me, id)) {
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN,
          "Only the person who uploaded this video, or an admin, can edit it.");
    }
    var title = body.title() == null ? "" : body.title().strip();
    if (title.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give it a title.");
    }
    var episode = body.kind() == VideoKind.EPISODE;
    if (episode
        && (body.showName() == null
            || body.showName().isBlank()
            || body.season() == null
            || body.episode() == null)) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "An episode needs a show, a season and an episode number.");
    }
    transaction.executeWithoutResult(
        status -> {
          var showId = episode ? ShowRows.upsert(jdbc, body.showName()) : null;
          jdbc.sql(
                  "update video set kind = :kind, title = :title, year = :year, show_id = :show,"
                      + " season = :season, episode = :episode where id = :id")
              .param("kind", body.kind().name())
              .param("title", title)
              .param("year", episode ? null : body.year())
              .param("show", showId)
              .param("season", episode ? body.season() : null)
              .param("episode", episode ? body.episode() : null)
              .param("id", id)
              .update();
          ShowRows.deleteEmpty(jdbc);
        });
    return queries.find(me, id).orElseThrow(VideosController::noSuchVideo);
  }

  @Operation(operationId = "streamVideo", summary = "The video file, as stored (direct play)")
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
        description = "No such video, or its file is missing from storage",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(responseCode = "416", description = "The range starts beyond the end of the file")
  })
  @GetMapping("/{id}/stream")
  ResponseEntity<StreamingResponseBody> stream(
      @PathVariable UUID id,
      @RequestHeader(value = HttpHeaders.RANGE, required = false) String range) {
    record Stored(String key, long size, String container) {}
    var stored =
        jdbc.sql("select object_key, size_bytes, container from video where id = :id")
            .param("id", id)
            .query(
                (rs, i) ->
                    new Stored(
                        rs.getString("object_key"),
                        rs.getLong("size_bytes"),
                        rs.getString("container")))
            .optional()
            .orElseThrow(VideosController::noSuchVideo);
    return streamer.stream(
        stored.key(),
        stored.size(),
        range,
        videoType(stored.container()),
        "The video file is missing.");
  }

  @Operation(operationId = "getVideoThumbnail", summary = "The frame taken at ingest")
  @ApiResponses({
    @ApiResponse(
        responseCode = "200",
        description = "The image",
        content =
            @Content(mediaType = "image/*", schema = @Schema(type = "string", format = "binary"))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video or no thumbnail",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{id}/thumbnail")
  ResponseEntity<byte[]> thumbnail(@PathVariable UUID id) {
    var key =
        jdbc.sql("select thumbnail_key from video where id = :id and thumbnail_key is not null")
            .param("id", id)
            .query(String.class)
            .optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No thumbnail."));
    return ResponseEntity.ok()
        .contentType(MediaType.IMAGE_JPEG)
        .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
        .body(read(key, "No thumbnail."));
  }

  @Operation(operationId = "getSubtitle", summary = "One subtitle track as WebVTT")
  @ApiResponses({
    @ApiResponse(
        responseCode = "200",
        description = "The subtitles",
        content = @Content(mediaType = "text/vtt", schema = @Schema(type = "string"))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video or subtitle track",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{id}/subtitles/{index}")
  ResponseEntity<byte[]> subtitle(@PathVariable UUID id, @PathVariable int index) {
    var key =
        jdbc.sql("select object_key from subtitle where video_id = :id and idx = :idx")
            .param("id", id)
            .param("idx", index)
            .query(String.class)
            .optional()
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such subtitles."));
    return ResponseEntity.ok()
        .contentType(new MediaType("text", "vtt", StandardCharsets.UTF_8))
        .cacheControl(CacheControl.noCache().cachePrivate())
        .body(read(key, "No such subtitles."));
  }

  @Operation(operationId = "addSubtitle", summary = "Attach a subtitle file (.srt or .vtt)")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "The subtitle track"),
    @ApiResponse(
        responseCode = "400",
        description = "Not a subtitle file, or too large",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping(value = "/{id}/subtitles", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @ResponseStatus(HttpStatus.CREATED)
  Subtitle addSubtitle(
      @PathVariable UUID id,
      @RequestPart("file") MultipartFile file,
      @RequestParam(required = false) String language)
      throws IOException {
    if (queries.uploader(id).isEmpty()) {
      throw noSuchVideo();
    }
    var name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
    var lower = name.toLowerCase(Locale.ROOT);
    if (!(lower.endsWith(".srt") || lower.endsWith(".vtt"))) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose an .srt or .vtt file.");
    }
    if (file.getSize() == 0 || file.getSize() > MAX_SUBTITLE_BYTES) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Subtitle files can be at most 2 MB.");
    }
    var text = new String(file.getBytes(), StandardCharsets.UTF_8);
    var vtt = Subtitles.toVtt(text);
    if (!vtt.contains("-->")) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "That file has no subtitles in it.");
    }
    var lang =
        language != null && !language.isBlank()
            ? Subtitles.normalizeLanguage(language)
            : Subtitles.languageFromFilename(name).orElse(null);
    return transaction.execute(
        status -> {
          var index =
              jdbc.sql("select coalesce(max(idx) + 1, 0) from subtitle where video_id = :id")
                  .param("id", id)
                  .query(Integer.class)
                  .single();
          var key = "subs/%s/%d.vtt".formatted(id, index);
          s3.putObject(
              PutObjectRequest.builder()
                  .bucket(bucket.ensure())
                  .key(key)
                  .contentType("text/vtt")
                  .build(),
              software.amazon.awssdk.core.sync.RequestBody.fromString(vtt, StandardCharsets.UTF_8));
          var label = Subtitles.label(lang, null, index);
          jdbc.sql(
                  "insert into subtitle (video_id, idx, language, label, object_key)"
                      + " values (:id, :idx, :language, :label, :key)")
              .param("id", id)
              .param("idx", index)
              .param("language", lang)
              .param("label", label)
              .param("key", key)
              .update();
          return new Subtitle(
              index, lang, label, "/api/v1/videos/%s/subtitles/%d".formatted(id, index));
        });
  }

  @Operation(operationId = "saveWatchProgress", summary = "Remember where you are in a video")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Your progress"),
    @ApiResponse(
        responseCode = "400",
        description = "Invalid position",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "404",
        description = "No such video",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PutMapping("/{id}/progress")
  WatchProgress saveProgress(
      @PathVariable UUID id,
      @Valid @RequestBody WatchProgressRequest body,
      Authentication authentication) {
    var me = currentUser.id(authentication);
    if (queries.uploader(id).isEmpty()) {
      throw noSuchVideo();
    }
    var watched = isWatched(body.positionMs(), body.durationMs());
    var saved =
        jdbc.sql(
                "insert into watch_progress (user_id, video_id, position_ms, duration_ms, watched,"
                    + " updated_at) values (:me, :id, :pos, :dur, :watched, now())"
                    + " on conflict (user_id, video_id) do update set position_ms = excluded.position_ms,"
                    + " duration_ms = excluded.duration_ms, watched = excluded.watched,"
                    + " updated_at = excluded.updated_at returning updated_at")
            .param("me", me)
            .param("id", id)
            .param("pos", body.positionMs())
            .param("dur", body.durationMs())
            .param("watched", watched)
            .query(java.time.OffsetDateTime.class)
            .single();
    return new WatchProgress(body.positionMs(), body.durationMs(), watched, saved.toInstant());
  }

  /** The same rule as the web client: 90%, or under 2 minutes left once half is watched. */
  static boolean isWatched(long positionMs, long durationMs) {
    if (durationMs <= 0) {
      return false;
    }
    if (positionMs >= durationMs * 0.9) {
      return true;
    }
    return durationMs - positionMs <= WATCHED_REMAINING_MS && positionMs >= durationMs / 2;
  }

  private boolean canEdit(Authentication authentication, UUID me, UUID videoId) {
    var admin =
        authentication.getAuthorities().stream()
            .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    return admin || queries.uploader(videoId).map(me::equals).orElse(false);
  }

  private byte[] read(String key, String missing) {
    try (var in = s3.getObject(b -> b.bucket(bucket.ensure()).key(key))) {
      return in.readAllBytes();
    } catch (NoSuchKeyException e) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, missing);
    } catch (IOException e) {
      throw new java.io.UncheckedIOException(e);
    }
  }

  static MediaType videoType(String container) {
    return switch (container == null ? "" : container) {
      case "mp4", "m4v" -> MediaType.parseMediaType("video/mp4");
      case "mov" -> MediaType.parseMediaType("video/quicktime");
      case "webm" -> MediaType.parseMediaType("video/webm");
      case "mkv" -> MediaType.parseMediaType("video/x-matroska");
      default -> MediaType.APPLICATION_OCTET_STREAM;
    };
  }

  static ResponseStatusException noSuchVideo() {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, "No such video.");
  }
}
