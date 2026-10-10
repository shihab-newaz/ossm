-- A user's liked tracks. Per user and never shared. Unlike play_event, there is nothing to keep once
-- a track or user is gone, so deleting either takes its likes with it.
CREATE TABLE favorite (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    track_id   uuid        NOT NULL REFERENCES track (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, track_id)
);

-- The Liked page: a user's likes, most recent first.
CREATE INDEX favorite_user_created_ix ON favorite (user_id, created_at DESC);
