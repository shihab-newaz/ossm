package dev.ossm.api.ingest;

/**
 * Removes everything stored under a key prefix, durably. The request is written to the same
 * Postgres as everything else (ADR 0002), so a caller inside a transaction commits the deletion
 * request together with its own change, and the job retries until the store confirms.
 */
interface ObjectDeletionQueue {

  /** Safe to call twice for the same prefix. */
  void deletePrefix(String prefix);
}
