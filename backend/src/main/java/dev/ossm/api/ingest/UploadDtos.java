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

  static final long MAX_BYTES = 250L * 1024 * 1024;

  private UploadDtos() {}

  enum UploadStatus {
    UPLOADING,
    INGESTING,
    DONE,
    FAILED
  }

  record CreateUploadRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotBlank(message = "Choose a file")
          @Size(max = 255, message = "That file name is too long")
          String filename,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotNull(message = "File size is missing")
          @Min(value = 1, message = "That file is empty")
          @Max(value = MAX_BYTES, message = "Files can be at most 250 MB")
          Long sizeBytes) {}

  record Upload(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String filename,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long sizeBytes,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UploadStatus status,
      String error,
      UUID trackId,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {}

  record UploadPart(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int partNumber,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String url) {}

  record UploadTicket(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Upload upload,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long partSizeBytes,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<UploadPart> parts) {}

  record CompletedPart(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Min(1) int partNumber,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotBlank String etag) {}

  record CompleteUploadRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotEmpty(message = "No parts were uploaded")
          List<@Valid CompletedPart> parts) {}
}
