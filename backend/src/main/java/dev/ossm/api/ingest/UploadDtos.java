package dev.ossm.api.ingest;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Wire types for uploads. Names become schema names in contract/openapi.yaml. */
final class UploadDtos {

  /** Audio files: 250 MB (spec 01). */
  static final long MAX_BYTES = 250L * 1024 * 1024;

  /** Video files: 20 GB (spec 03). The largest size the API accepts at all. */
  static final long MAX_VIDEO_BYTES = 20L * 1024 * 1024 * 1024;

  /** Part URLs come in pages of this many: a 20 GB file has about 1,280 parts. */
  static final int PART_PAGE = 200;

  /** What an upload holds, from its file extension. Ingest still checks the bytes. */
  enum UploadKind {
    AUDIO,
    VIDEO
  }

  private UploadDtos() {}

  enum UploadStatus {
    UPLOADING,
    INGESTING,
    DONE,
    FAILED,
    DUPLICATE
  }

  record CreateUploadRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotBlank(message = "Choose a file")
          @Size(max = 255, message = "That file name is too long")
          String filename,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotNull(message = "File size is missing")
          @Min(value = 1, message = "That file is empty")
          @Max(value = MAX_VIDEO_BYTES, message = "Files can be at most 20 GB")
          Long sizeBytes,
      @Schema(
              description = "Defaults to All rights reserved",
              allowableValues = {
                "All rights reserved",
                "CC BY",
                "CC BY-SA",
                "CC BY-NC",
                "CC BY-ND",
                "CC BY-NC-SA",
                "CC BY-NC-ND",
                "CC0"
              })
          String license) {}

  record Upload(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String filename,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long sizeBytes,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UploadStatus status,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UploadKind kind,
      String error,
      UUID trackId,
      UUID videoId,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {}

  record UploadPart(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int partNumber,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String url) {}

  record UploadTicket(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Upload upload,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long partSizeBytes,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "How many parts in all")
          int partCount,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "The first parts; ask /uploads/{id}/parts for the rest")
          List<UploadPart> parts) {}

  record CompletedPart(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Min(1) int partNumber,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotBlank String etag) {}

  record CompleteUploadRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotEmpty(message = "No parts were uploaded")
          List<@Valid CompletedPart> parts) {}
}
