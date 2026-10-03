-- Licence chosen at upload time, copied onto the track at ingest.
ALTER TABLE upload ADD COLUMN license text NOT NULL DEFAULT 'All rights reserved';

-- A re-upload of identical bytes ends as DUPLICATE, pointing at the track that already exists.
ALTER TABLE upload DROP CONSTRAINT upload_status_check;
ALTER TABLE upload
    ADD CONSTRAINT upload_status_check
    CHECK (status IN ('UPLOADING', 'INGESTING', 'DONE', 'FAILED', 'DUPLICATE'));

-- The database, not just the ingest code, guarantees one track per distinct file.
CREATE UNIQUE INDEX track_content_hash_unique ON track (content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX upload_failed_ix ON upload (updated_at DESC) WHERE status = 'FAILED';
