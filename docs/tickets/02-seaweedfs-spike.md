# 02: SeaweedFS spike

**Parent:** docs/specs/01-phase-1-core-app.md
**Status:** ready-for-agent
**Blocked by:** None (can start immediately)

## What to build

A time-boxed investigation that decides whether SeaweedFS is the reference S3-compatible object store for Phase 1 (MinIO's community edition is archived and no longer distributed). The deliverable is a short written finding plus a working throwaway demo, not production code.

Using only the AWS SDK v2 S3 client with a configurable endpoint, verify against a SeaweedFS container started the way the compose stack will start it:

- Multipart upload of a large file (at least 250 MB) using presigned part URLs.
- Presigned GET and PUT URLs, including expiry behavior.
- Range reads (seeking) on a large object, including suffix and open-ended ranges.
- Bucket and key conventions for audio files and cover art.
- Behavior when run under Testcontainers (startup time, readiness check, teardown).
- Idle memory and startup footprint, to size the demo VPS.

## Acceptance criteria

- [ ] A written finding records each item above as pass/fail with notes, and ends with a go/no-go.
- [ ] If no-go, the finding names the fallback (Garage or another S3-compatible store) and repeats the checks against it.
- [ ] The finding lists any S3 features OSSM must avoid to stay store-agnostic.
- [ ] A minimal, reusable container configuration for the chosen store is handed to ticket 01's compose stack and to the Testcontainers setup.
- [ ] An ADR records the object-store decision and the vendor-neutral AWS SDK approach.
