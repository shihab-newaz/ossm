package dev.ossm.api.events;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Receives playback events from the player. The user comes from the session, never the body. */
@RestController
@RequestMapping("/api/v1/events")
class EventsController {

  @Schema(
      description =
          "A playback event as the player reports it. The server adds the user from the session"
              + " and stores the whole envelope unchanged. play_completed is the qualifying play:"
              + " sent once, at 30 seconds or half the track, whichever comes first.")
  record PlaybackEventRequest(
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Chosen by the client. Sending the same id again is harmless.")
          @NotNull(message = "Event id is missing")
          UUID eventId,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Envelope version. Currently 1.")
          @NotNull(message = "Schema version is missing")
          @Min(value = 1, message = "Unsupported schema version")
          @Max(value = PlaybackEvent.CURRENT_VERSION, message = "Unsupported schema version")
          Integer schemaVersion,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotNull(message = "Track is missing")
          UUID trackId,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              allowableValues = {"play_started", "play_completed", "skipped"})
          @NotNull(message = "Event type is missing")
          @Pattern(regexp = "play_started|play_completed|skipped", message = "Unknown event type")
          String type,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "When it happened on the client")
          @NotNull(message = "Time is missing")
          Instant occurredAt,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Playback position in milliseconds when it happened")
          @NotNull(message = "Position is missing")
          @Min(value = 0, message = "Position cannot be negative")
          Long positionMs,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Identifies the app instance, for example a per-browser random id")
          @NotBlank(message = "Client id is missing")
          @Size(max = 64, message = "That client id is too long")
          String clientId) {}

  private final EventPublisher publisher;
  private final CurrentUser currentUser;

  EventsController(EventPublisher publisher, CurrentUser currentUser) {
    this.publisher = publisher;
    this.currentUser = currentUser;
  }

  @Operation(
      operationId = "recordPlaybackEvent",
      summary = "Report a playback event",
      description =
          "Idempotent by event id: sending the same event again answers 202 and stores nothing.")
  @ApiResponses({
    @ApiResponse(responseCode = "202", description = "Accepted (new or already stored)"),
    @ApiResponse(
        responseCode = "400",
        description = "Invalid event",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "404",
        description = "No such track",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "The event id is already used by another event",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/playback")
  @ResponseStatus(HttpStatus.ACCEPTED)
  void record(@Valid @RequestBody PlaybackEventRequest body, Authentication authentication) {
    var event =
        new PlaybackEvent(
            body.eventId(),
            body.schemaVersion(),
            currentUser.id(authentication),
            body.trackId(),
            PlaybackEvent.Type.fromWire(body.type()),
            body.occurredAt(),
            body.positionMs(),
            body.clientId());
    EventPublisher.Outcome outcome;
    try {
      outcome = publisher.publish(event);
    } catch (DataIntegrityViolationException e) {
      // The only foreign key a valid event can break is the track.
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such track.");
    }
    if (outcome == EventPublisher.Outcome.CLASH) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "That event id is already in use.");
    }
  }
}
