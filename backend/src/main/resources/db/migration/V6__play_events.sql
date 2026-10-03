-- Playback events: an immutable, versioned envelope. One row per event, never updated.
-- seq gives a transactional-outbox relay a stable order to read in (and a cursor to resume from)
-- without changing how events are written.
CREATE TABLE play_event (
    seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    event_id       uuid PRIMARY KEY,
    schema_version int         NOT NULL,
    user_id        uuid        NOT NULL REFERENCES users (id),
    track_id       uuid        NOT NULL REFERENCES track (id),
    type           text        NOT NULL CHECK (type IN ('play_started', 'play_completed', 'skipped')),
    occurred_at    timestamptz NOT NULL,
    position_ms    bigint      NOT NULL CHECK (position_ms >= 0),
    client_id      text        NOT NULL,
    received_at    timestamptz NOT NULL DEFAULT now()
);

-- History: a user's recent qualifying plays. Most played: counts per track for a user.
CREATE INDEX play_event_user_type_time_ix ON play_event (user_id, type, occurred_at DESC);
CREATE INDEX play_event_user_track_ix ON play_event (user_id, track_id) WHERE type = 'play_completed';
