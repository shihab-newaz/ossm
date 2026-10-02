# Spike 02: SeaweedFS as the S3-compatible store

**Verdict: go.** SeaweedFS 4.48 passes every check OSSM needs. Garage stays the documented fallback and was not needed.

The runnable evidence is `spikes/s3-store/` (JUnit + Testcontainers + AWS SDK v2). Run it with `./gradlew test` from that directory; every finding prints as a `SPIKE ...` line. The code is throwaway; this document is the deliverable.

Only the AWS SDK v2 S3 client (endpoint override, path-style) and plain HTTP against presigned URLs were used. No SeaweedFS-specific API.

## Results

| Check | Result | Notes |
| --- | --- | --- |
| Multipart upload, 250 MB, presigned part URLs | Pass | 10 x 25 MB parts, each PUT to a presigned `UploadPart` URL over plain HTTP, then `CompleteMultipartUpload`. ~2.2 s up, ~1.3 s full read-back, SHA-256 identical. The `ETag` response header is returned on each part. |
| Presigned GET and PUT | Pass | Both round-trip byte-for-byte. A tampered signature returns 403. |
| Presigned expiry | Pass | A 2 s URL returns 200 inside the window and 403 after it. |
| Range reads | Pass | `bytes=a-b`, open-ended `bytes=a-`, suffix `bytes=-n`, a range crossing a multipart part boundary, and an end past EOF (clamped) all return 206 with correct bytes and `Content-Range`. A start past EOF returns 416. `Accept-Ranges: bytes` is sent. |
| Bucket and key conventions | Pass | Content-type and user metadata survive, prefix listing and delete work. See below. |
| Testcontainers | Pass | Port open ~5.0 s, first authenticated call ~5.4 s after `start()`, teardown ~1.2 s. Wait for the listening port, then poll `listBuckets`. |
| Footprint | Pass | Idle ~87 MiB RSS (~156 MiB after a long uptime in compose). ~640 MiB right after writing 290 MB in one test run; I did not measure whether it settles back. One container runs master, volume, filer and the S3 gateway. Sizing the demo VPS needs a longer soak: budget at least 1 GB for the store alone until that is measured. |

### SDK checksum behaviour

The 2025 SDK default (CRC32 on every request) works against SeaweedFS 4.48. The spike clients still set `requestChecksumCalculation(WHEN_REQUIRED)` and `responseChecksumValidation(WHEN_REQUIRED)`. The cost is nothing, and it protects against a store that rejects the trailer format. Keep it in the production client configuration.

## Conventions to adopt

- One bucket, `ossm`, configurable. Don't create a bucket per user or per kind of file.
- Keys are content-addressed: `audio/<first-2-hex>/<sha256>.<ext>` and `covers/<first-2-hex>/<sha256>.<ext>`. The hash is also the dedupe key. The fan-out prefix keeps listings small.
- Set `Content-Type` on upload (`audio/mpeg`, `audio/flac`, `image/jpeg`). Keep the original filename in Postgres, not in object metadata; metadata worked, but Postgres is the system of record.
- Postgres holds the key and metadata, never a URL. Presign at request time.

## Keep store-agnostic: avoid or isolate

These returned success against SeaweedFS (a successful call, not verified behaviour), but nothing in OSSM should depend on them, because Garage and other stores differ:

- Versioning, object tagging, lifecycle rules, and server-side encryption options. Run cleanup of abandoned multipart uploads from the application (a scheduled job using `listMultipartUploads` + `abortMultipartUpload`) rather than a lifecycle rule.
- ACLs and bucket policies. Access is by presigned URL or by the API's own credentials.
- Bucket-level CORS as the only line of defence for browser uploads (see below).
- Anonymous access. With credentials configured, anonymous `GET /` returns 403, which is what we want.

## Open design point for the upload slice

Presigned URLs embed the host that signed them. For the browser to PUT parts directly to the store, the API must presign against a host the browser can reach, and the store needs either that host in the same origin as the app or CORS. The spike confirmed `PutBucketCors` is accepted and a preflight returns the right `Allow-Origin`, `Allow-Methods` and `Expose-Headers: ETag` (the ETag must be exposed, since the client sends it back on complete). The simpler option is a Caddy route that proxies a path such as `/s3/*` to the store on the same origin, so no CORS is needed. That choice belongs to the upload ticket; it is not made here.

## Reusable configuration

Compose (`deploy/compose.yaml`, now pinned and with credentials and a healthcheck):

```yaml
storage:
  image: chrislusf/seaweedfs:4.48
  command: server -dir=/data -s3
  environment:
    AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY:-ossm-access}
    AWS_SECRET_ACCESS_KEY: ${S3_SECRET_KEY:-ossm-secret-key}
  healthcheck:
    test: ["CMD", "nc", "-z", "127.0.0.1", "8333"]
```

The healthcheck is a port check because the image has no unauthenticated HTTP readiness path once credentials are set. The defaults are for local development; real deployments set `S3_ACCESS_KEY` and `S3_SECRET_KEY`.

Testcontainers (what the backend integration tests will use):

```java
new GenericContainer<>("chrislusf/seaweedfs:4.48")
    .withCommand("server", "-dir=/data", "-s3")
    .withEnv("AWS_ACCESS_KEY_ID", "test-access")
    .withEnv("AWS_SECRET_ACCESS_KEY", "test-secret")
    .withExposedPorts(8333)
    .waitingFor(Wait.forListeningPorts(8333));
```

Then poll `listBuckets()` until it succeeds before creating the bucket.

## Not verified

- Behaviour at scale (thousands of objects, long uptime, volume compaction).
- Multi-node or replicated setups; OSSM targets a single node.
- Whether versioning, tagging and lifecycle actually take effect. Only that the calls are accepted.
