package dev.ossm.api.events;

/**
 * Where playback events go. Producers only ever call this port. Phase 1 writes to Postgres; a later
 * adapter can write to an outbox and relay to Kafka without the producers changing.
 */
public interface EventPublisher {

  enum Outcome {
    /** The event was stored. */
    STORED,
    /** The same event id was already stored for this user, so nothing changed. */
    DUPLICATE,
    /** The event id already belongs to someone else's event. */
    CLASH
  }

  Outcome publish(PlaybackEvent event);
}
