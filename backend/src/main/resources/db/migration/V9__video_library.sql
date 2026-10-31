-- Video library (spec 03): movies and shows, played straight from the file.

-- A series. Season is a number on the episode, not a table of its own.
CREATE TABLE video_show (
    id         uuid PRIMARY KEY,
    name       text        NOT NULL,
    -- Case- and whitespace-insensitive identity, like artist names.
    name_key   text        NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE video (
    id            uuid PRIMARY KEY,
    kind          text        NOT NULL CHECK (kind IN ('MOVIE', 'EPISODE')),
    title         text        NOT NULL,
    year          int,
    description   text,
    show_id       uuid REFERENCES video_show (id),
    season        int,
    episode       int,
    duration_ms   bigint      NOT NULL,
    width         int,
    height        int,
    video_codec   text,
    audio_codec   text,
    container     text        NOT NULL,
    bitrate_kbps  int,
    -- False when the browser may not play the file as stored (there is no transcoding).
    playable      boolean     NOT NULL,
    content_hash  text,
    object_key    text        NOT NULL,
    size_bytes    bigint      NOT NULL,
    thumbnail_key text,
    license       text        NOT NULL DEFAULT 'All rights reserved',
    uploader_id   uuid        NOT NULL REFERENCES users (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT video_episode_has_show CHECK ((kind = 'EPISODE') = (show_id IS NOT NULL))
);

-- One video per distinct file, guaranteed by the database (as for tracks).
CREATE UNIQUE INDEX video_content_hash_unique ON video (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX video_kind_created_ix ON video (kind, created_at DESC);
CREATE INDEX video_show_order_ix ON video (show_id, season, episode);

-- Text subtitles, stored as WebVTT: extracted at ingest or added later.
CREATE TABLE subtitle (
    video_id   uuid        NOT NULL REFERENCES video (id) ON DELETE CASCADE,
    idx        int         NOT NULL,
    language   text,
    label      text        NOT NULL,
    object_key text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (video_id, idx)
);

-- Where each person is in each video. Last write wins; this is not a playback event.
CREATE TABLE watch_progress (
    user_id     uuid        NOT NULL REFERENCES users (id),
    video_id    uuid        NOT NULL REFERENCES video (id) ON DELETE CASCADE,
    position_ms bigint      NOT NULL CHECK (position_ms >= 0),
    duration_ms bigint      NOT NULL CHECK (duration_ms >= 0),
    watched     boolean     NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, video_id)
);

CREATE INDEX watch_progress_recent_ix ON watch_progress (user_id, updated_at DESC);

-- Uploads now carry audio or video. Existing rows are audio.
ALTER TABLE upload ADD COLUMN kind text NOT NULL DEFAULT 'AUDIO' CHECK (kind IN ('AUDIO', 'VIDEO'));
ALTER TABLE upload ADD COLUMN video_id uuid REFERENCES video (id);
