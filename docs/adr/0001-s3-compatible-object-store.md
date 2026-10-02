# 1. Talk to any S3-compatible object store; SeaweedFS is the reference

Status: accepted

## Context

Audio files and cover art are blobs and belong in an object store, not in Postgres. The obvious self-hosted choice was MinIO, but its community edition is archived and no longer distributed.

## Decision

The backend uses the AWS SDK v2 S3 client with a configurable endpoint, so it is not tied to one product. SeaweedFS is the reference deployment in the compose stack; Garage is the fallback. A spike (ticket 02, `docs/spikes/02-seaweedfs-finding.md`) verified multipart upload with presigned part URLs, presigned GET/PUT and expiry, and open-ended and suffix range reads against SeaweedFS 4.48. The result was go; Garage was not needed.

## Consequences

Switching stores is configuration, not code. We only rely on the S3 features that every candidate supports: multipart upload, presigned URLs, range reads, prefix listing, and delete. Versioning, tagging, lifecycle rules, ACLs and server-side encryption are out, so abandoned multipart uploads are cleaned up by the application. The SeaweedFS image is pinned to 4.48 in compose and in Testcontainers.
