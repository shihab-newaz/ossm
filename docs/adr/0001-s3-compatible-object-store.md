# 1. Talk to any S3-compatible object store; SeaweedFS is the reference

Status: accepted

## Context

Audio files and cover art are blobs and belong in an object store, not in Postgres. The obvious self-hosted choice was MinIO, but its community edition is archived and no longer distributed.

## Decision

The backend uses the AWS SDK v2 S3 client with a configurable endpoint, so it is not tied to one product. SeaweedFS is the reference deployment in the compose stack; Garage is the fallback. A spike (ticket 02) verifies multipart upload, presigned URLs and range reads against SeaweedFS before the upload slice depends on them.

## Consequences

Switching stores is configuration, not code. We only rely on the S3 features that every candidate supports.
