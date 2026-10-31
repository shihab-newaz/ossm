package dev.ossm.api.video;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Wire types for the video library. Names become schema names in contract/openapi.yaml. */
final class VideoDtos {

  private VideoDtos() {}

  enum VideoKind {
    MOVIE,
    EPISODE
  }

  record WatchProgress(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long positionMs,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long durationMs,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean watched,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {}

  record Video(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) VideoKind kind,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "The movie's title, or the episode's own title")
          String title,
      Integer year,
      String description,
      @Schema(description = "Episodes only") UUID showId,
      @Schema(description = "Episodes only") String showName,
      @Schema(description = "Episodes only") Integer season,
      @Schema(description = "Episodes only") Integer episode,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long durationMs,
      Integer width,
      Integer height,
      @Schema(description = "As ffprobe names it, e.g. h264, hevc, av1, vp9") String videoCodec,
      String audioCodec,
      @Schema(description = "mp4, mov, webm or mkv") String container,
      Integer bitrateKbps,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "False when the browser may not be able to play the file as stored")
          boolean playable,
      @Schema(description = "Same-origin path to the thumbnail, when it has one")
          String thumbnailUrl,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String license,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Who uploaded it")
          String uploadedBy,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
      WatchProgress progress) {}

  record Subtitle(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int index,
      @Schema(description = "A language tag such as en, when known") String language,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "e.g. English")
          String label,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Path to the WebVTT file")
          String url) {}

  record VideoDetail(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Video video,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Subtitle> subtitles,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description =
                  "For an episode, the rest of its show in order; for a movie, other movies")
          List<Video> upNext,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Whether you may change its details")
          boolean canEdit) {}

  record VideoUpdate(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotNull(message = "Choose movie or episode")
          VideoKind kind,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
      Integer year,
      @Schema(description = "Required for an episode") String showName,
      @Min(value = 0, message = "Season cannot be negative") Integer season,
      @Min(value = 0, message = "Episode cannot be negative") Integer episode) {}

  record WatchProgressRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @Min(value = 0, message = "Invalid position")
          long positionMs,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @Min(value = 0, message = "Invalid duration")
          long durationMs) {}

  record Show(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int seasonCount,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int episodeCount,
      @Schema(description = "The latest episode's thumbnail") String thumbnailUrl,
      WatchProgress progress) {}

  record Season(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int number,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "In episode order")
          List<Video> episodes) {}

  record ShowDetail(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Show show,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Who uploaded the first episode")
          String uploadedBy,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Season> seasons,
      Video resume) {}
}
