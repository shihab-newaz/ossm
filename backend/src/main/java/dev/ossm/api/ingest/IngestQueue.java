package dev.ossm.api.ingest;

import java.util.UUID;

/**
 * Hands finished uploads to the ingest worker. The Phase 1 adapter is a Postgres-backed scheduler;
 * the port keeps the upload flow independent of how jobs are stored and run.
 */
public interface IngestQueue {

  /** Durable: once this returns, the job survives an API restart. Safe to call twice. */
  void enqueue(UUID uploadId);
}
