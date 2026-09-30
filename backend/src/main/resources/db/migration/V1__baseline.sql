-- Baseline so Flyway has a history table from day one. Real tables arrive with the slices that need them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
