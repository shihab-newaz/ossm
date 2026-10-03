CREATE TABLE artist (
    id         uuid PRIMARY KEY,
    name       text        NOT NULL,
    -- Case- and whitespace-insensitive identity, so "Daft Punk" and " daft punk " are one artist.
    name_key   text        NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE album (
    id             uuid PRIMARY KEY,
    title          text        NOT NULL,
    title_key      text        NOT NULL,
    artist_id      uuid        NOT NULL REFERENCES artist (id),
    year           int,
    cover_key      text,
    dominant_color text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT album_artist_title_unique UNIQUE (artist_id, title_key)
);

CREATE TABLE track (
    id           uuid PRIMARY KEY,
    title        text        NOT NULL,
    artist_id    uuid        NOT NULL REFERENCES artist (id),
    album_id     uuid REFERENCES album (id),
    track_number int,
    disc_number  int,
    year         int,
    genre        text,
    duration_ms  bigint      NOT NULL,
    codec        text,
    bitrate_kbps int,
    content_hash text,
    object_key   text        NOT NULL,
    size_bytes   bigint      NOT NULL,
    license      text        NOT NULL DEFAULT 'All rights reserved',
    uploader_id  uuid        NOT NULL REFERENCES users (id),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX track_created_at_ix ON track (created_at DESC);
CREATE INDEX track_album_id_ix ON track (album_id);
CREATE INDEX track_artist_id_ix ON track (artist_id);

CREATE TABLE upload (
    id           uuid PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users (id),
    filename     text        NOT NULL,
    size_bytes   bigint      NOT NULL,
    object_key   text        NOT NULL UNIQUE,
    s3_upload_id text        NOT NULL,
    status       text        NOT NULL CHECK (status IN ('UPLOADING', 'INGESTING', 'DONE', 'FAILED')),
    error        text,
    track_id     uuid REFERENCES track (id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX upload_user_created_ix ON upload (user_id, created_at DESC);

-- db-scheduler's table (PostgreSQL), owned by Flyway.
CREATE TABLE scheduled_tasks (
    task_name            text                     NOT NULL,
    task_instance        text                     NOT NULL,
    task_data            bytea,
    execution_time       timestamp with time zone NOT NULL,
    picked               boolean                  NOT NULL,
    picked_by            text,
    last_success         timestamp with time zone,
    last_failure         timestamp with time zone,
    consecutive_failures int,
    last_heartbeat       timestamp with time zone,
    version              bigint                   NOT NULL,
    priority             smallint,
    PRIMARY KEY (task_name, task_instance)
);

CREATE INDEX execution_time_idx ON scheduled_tasks (execution_time);
CREATE INDEX last_heartbeat_idx ON scheduled_tasks (last_heartbeat);
CREATE INDEX priority_execution_time_idx ON scheduled_tasks (priority DESC, execution_time ASC);
