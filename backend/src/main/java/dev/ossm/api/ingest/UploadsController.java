package dev.ossm.api.ingest;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.ingest.UploadDtos.CompleteUploadRequest;
import dev.ossm.api.ingest.UploadDtos.CreateUploadRequest;
import dev.ossm.api.ingest.UploadDtos.Upload;
import dev.ossm.api.ingest.UploadDtos.UploadTicket;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/uploads")
class UploadsController {

  private final UploadService uploads;
  private final CurrentUser currentUser;

  UploadsController(UploadService uploads, CurrentUser currentUser) {
    this.uploads = uploads;
    this.currentUser = currentUser;
  }

  @Operation(operationId = "listUploads")
  @GetMapping
  List<Upload> list(Authentication authentication) {
    return uploads.recent(currentUser.id(authentication));
  }

  @Operation(operationId = "createUpload")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Upload started"),
    @ApiResponse(
        responseCode = "400",
        description = "Missing file name, or a file larger than 250 MB",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  UploadTicket create(@Valid @RequestBody CreateUploadRequest body, Authentication authentication) {
    return uploads.create(
        currentUser.id(authentication), body.filename(), body.sizeBytes(), body.license());
  }

  @Operation(operationId = "getUpload")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The upload and its ingest status"),
    @ApiResponse(
        responseCode = "404",
        description = "Not found",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{id}")
  Upload get(@PathVariable UUID id, Authentication authentication) {
    return uploads
        .find(currentUser.id(authentication), id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such upload."));
  }

  @Operation(operationId = "retryUpload")
  @ApiResponses({
    @ApiResponse(responseCode = "202", description = "Ingest queued again"),
    @ApiResponse(
        responseCode = "404",
        description = "Not found",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "Only failed uploads can be retried",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/{id}/retry")
  @ResponseStatus(HttpStatus.ACCEPTED)
  Upload retry(@PathVariable UUID id, Authentication authentication) {
    return uploads.retry(currentUser.id(authentication), id);
  }

  @Operation(operationId = "completeUpload")
  @ApiResponses({
    @ApiResponse(responseCode = "202", description = "Ingest queued"),
    @ApiResponse(
        responseCode = "400",
        description = "The object store rejected the parts",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "404",
        description = "Not found",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "Already completed",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/{id}/complete")
  @ResponseStatus(HttpStatus.ACCEPTED)
  Upload complete(
      @PathVariable UUID id,
      @Valid @RequestBody CompleteUploadRequest body,
      Authentication authentication) {
    return uploads.complete(currentUser.id(authentication), id, body);
  }
}
