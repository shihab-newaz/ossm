-- Search: trigram matching over the shared library (pg_trgm ships with Postgres and is a trusted
-- extension, so no superuser is needed to create it).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A track is found by its title, its artist and its album together, and an album by its title and
-- its artist, so each row carries that text. A trigger keeps it right on every insert and on any
-- change to what it is built from: ingest and tests that insert rows directly need not know it
-- exists. Artist names and album titles are never edited, so nothing else can make it stale.
ALTER TABLE track ADD COLUMN search_text text NOT NULL DEFAULT '';
ALTER TABLE album ADD COLUMN search_text text NOT NULL DEFAULT '';

CREATE FUNCTION track_set_search_text() RETURNS trigger AS $$
BEGIN
    NEW.search_text := concat_ws(' ',
        NEW.title,
        (SELECT a.name FROM artist a WHERE a.id = NEW.artist_id),
        (SELECT al.title FROM album al WHERE al.id = NEW.album_id));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_set_search_text
    BEFORE INSERT OR UPDATE OF title, artist_id, album_id ON track
    FOR EACH ROW EXECUTE FUNCTION track_set_search_text();

CREATE FUNCTION album_set_search_text() RETURNS trigger AS $$
BEGIN
    NEW.search_text := concat_ws(' ',
        NEW.title,
        (SELECT a.name FROM artist a WHERE a.id = NEW.artist_id));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER album_set_search_text
    BEFORE INSERT OR UPDATE OF title, artist_id ON album
    FOR EACH ROW EXECUTE FUNCTION album_set_search_text();

-- Fill the column for rows that already exist (a no-op update fires the triggers above).
UPDATE track SET title = title;
UPDATE album SET title = title;

CREATE INDEX track_search_trgm_ix ON track USING gin (search_text gin_trgm_ops);
CREATE INDEX album_search_trgm_ix ON album USING gin (search_text gin_trgm_ops);
CREATE INDEX artist_name_trgm_ix ON artist USING gin (name gin_trgm_ops);

-- Whole words typed so far ("gl", "dang") are prefix matches on the 'simple' text search
-- configuration: no stemming or stop words, which would only get in the way of song titles. The
-- trigram indexes above handle typos.
CREATE INDEX track_search_fts_ix ON track USING gin (to_tsvector('simple', search_text));
CREATE INDEX album_search_fts_ix ON album USING gin (to_tsvector('simple', search_text));
CREATE INDEX artist_name_fts_ix ON artist USING gin (to_tsvector('simple', name));
