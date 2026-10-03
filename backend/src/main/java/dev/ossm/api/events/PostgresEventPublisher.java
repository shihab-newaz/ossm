package dev.ossm.api.events;

import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Phase 1 adapter: the event is one row in {@code play_event}, written once and never changed. */
@Component
class PostgresEventPublisher implements EventPublisher {

  private final JdbcClient jdbc;

  PostgresEventPublisher(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Outcome publish(PlaybackEvent event) {
    var inserted =
        jdbc.sql(
                "insert into play_event (event_id, schema_version, user_id, track_id, type,"
                    + " occurred_at, position_ms, client_id) values (:id, :version, :user, :track,"
                    + " :type, :at, :position, :client) on conflict (event_id) do nothing")
            .param("id", event.eventId())
            .param("version", event.schemaVersion())
            .param("user", event.userId())
            .param("track", event.trackId())
            .param("type", event.type().wire())
            .param("at", event.occurredAt().atOffset(ZoneOffset.UTC))
            .param("position", event.positionMs())
            .param("client", event.clientId())
            .update();
    if (inserted == 1) {
      return Outcome.STORED;
    }
    var owner =
        jdbc.sql("select user_id from play_event where event_id = :id")
            .param("id", event.eventId())
            .query(UUID.class)
            .single();
    return owner.equals(event.userId()) ? Outcome.DUPLICATE : Outcome.CLASH;
  }
}
