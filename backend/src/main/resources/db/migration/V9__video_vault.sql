-- The video vault (spec 03): each user's private set of videos. Playlists come in a later migration.

-- Trigram matching over a vault's titles and descriptions. pg_trgm arrives with V7; btree_gin lets
-- one GIN index cover (owner_id, search_text), so a search reads only the signed-in user's rows.
-- Both are trusted extensions, so no superuser is needed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE TABLE video (
    -- The id of the upload that created it, so its object key is known before ingest runs.
    id                uuid PRIMARY KEY,
    owner_id          uuid        NOT NULL REFERENCES users (id),
    title             text        NOT NULL,
    description       text        NOT NULL DEFAULT '',
    original_filename text        NOT NULL,
    container         text        NOT NULL CHECK (container IN ('MP4', 'MOV', 'WEBM', 'MKV')),
    -- The full key is stored, so a later change of layout does not break old videos.
    object_key        text        NOT NULL UNIQUE,
    size_bytes        bigint      NOT NULL,
    content_hash      text        NOT NULL,
    -- Captured by the browser while it uploads; only for display, so all optional.
    duration_ms       bigint,
    width             int,
    height            int,
    thumbnail_key     text,
    search_text       text GENERATED ALWAYS AS (title || ' ' || description) STORED,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- The database, not just ingest, guarantees one video per distinct file per vault.
    CONSTRAINT video_owner_hash_unique UNIQUE (owner_id, content_hash)
);

-- The vault grid: one owner's videos, newest first, read by keyset pages.
CREATE INDEX video_owner_created_ix ON video (owner_id, created_at DESC, id DESC);
-- Search within one vault.
CREATE INDEX video_owner_search_ix ON video USING gin (owner_id, search_text gin_trgm_ops);

-- An upload is audio or video. A finished video upload points at its video; deleting the video
-- removes the upload row with it (upload rows are transfer history, the vault is the video table).
ALTER TABLE upload ADD COLUMN kind text NOT NULL DEFAULT 'AUDIO' CHECK (kind IN ('AUDIO', 'VIDEO'));
ALTER TABLE upload ADD COLUMN video_id uuid REFERENCES video (id) ON DELETE CASCADE;

-- A DONE or DUPLICATE upload points at exactly one thing, and it is the one its kind names.
ALTER TABLE upload
    ADD CONSTRAINT upload_finished_target_check
    CHECK (status NOT IN ('DONE', 'DUPLICATE')
        OR (kind = 'AUDIO' AND track_id IS NOT NULL AND video_id IS NULL)
        OR (kind = 'VIDEO' AND video_id IS NOT NULL AND track_id IS NULL));

CREATE INDEX upload_video_id_ix ON upload (video_id) WHERE video_id IS NOT NULL;
