package dev.ossm.api.events;

import java.time.Instant;
import java.util.UUID;

/**
 * The playback event envelope. Immutable. {@code schemaVersion} changes only when a field is added,
 * removed or changes meaning, so consumers can tell which shape they are reading.
 */
public record PlaybackEvent(
    UUID eventId,
    int schemaVersion,
    UUID userId,
    UUID trackId,
    Type type,
    Instant occurredAt,
    long positionMs,
    String clientId) {

  public static final int CURRENT_VERSION = 1;

  /**
   * {@code PLAY_COMPLETED} is the qualifying play: sent once, when the listener reaches 30 seconds
   * or half the track, whichever comes first. It does not mean the track played to its end.
   */
  public enum Type {
    PLAY_STARTED("play_started"),
    PLAY_COMPLETED("play_completed"),
    SKIPPED("skipped");

    private final String wire;

    Type(String wire) {
      this.wire = wire;
    }

    public String wire() {
      return wire;
    }

    public static Type fromWire(String value) {
      for (var type : values()) {
        if (type.wire.equals(value)) {
          return type;
        }
      }
      throw new IllegalArgumentException("Unknown event type: " + value);
    }
  }
}
