# 2. Spike the object store

Ticket 02. ADR 0001. Finding: `docs/spikes/02-seaweedfs-finding.md`. Code: `spikes/s3-store/`.

## Goal

Decide, with evidence, whether a candidate S3-compatible store can do what upload and playback need, before building on it. The deliverable is a short written finding and throwaway code, not production code.

## Why a spike, and why now

Audio files are up to 250 MB and belong in an object store, not in Postgres. The obvious self-hosted choice (MinIO) had become unavailable, so the store was a real unknown. Finding a limit after the upload code exists means rewriting it. Finding it in a throwaway project costs a day.

## Learn first

- S3 multipart upload: create, upload parts, complete. Every part except the last must be at least 5 MiB. The `ETag` of each part is needed to complete.
- Presigned URLs: a URL that carries its own signature and expiry. The signature covers the host and path, which matters later (rung 4).
- HTTP range requests: `bytes=a-b`, open-ended `bytes=a-`, suffix `bytes=-n`, and what `206` and `416` mean.
- Path-style versus virtual-host-style addressing, and why self-hosted stores usually need path-style.

## Procedure

1. List the questions the product depends on. Here: multipart upload with presigned part URLs at 250 MB; presigned GET and PUT with expiry; range reads including suffix and open-ended; key conventions; behaviour under Testcontainers; idle footprint.
2. Write one JUnit test per question, using only the vendor-neutral AWS SDK v2 S3 client with an endpoint override, and plain HTTP against presigned URLs. No store-specific API, so the result transfers to other stores.
3. Start the store exactly as compose will start it, with credentials set.
4. Record each result as pass/fail with the measurement, not just "works".
5. Write the verdict, the fallback if it had been no-go, and the list of S3 features the product must not depend on.
6. Hand over a reusable container configuration to the compose stack and to the Testcontainers setup.
7. Write the ADR.

## What the finding established

- Ten 25 MB parts uploaded to presigned part URLs, completed, and read back with an identical SHA-256.
- A tampered signature returns 403. A 2-second URL works inside the window and returns 403 after.
- Range reads return correct bytes and `Content-Range`: `a-b`, `a-`, `-n`, a range crossing a part boundary, an end past EOF (clamped). A start past EOF returns 416.
- Under Testcontainers: port open in about 5 s, so wait for the port and then poll `listBuckets`.

## Decisions and why

- **Vendor-neutral SDK, configurable endpoint (ADR 0001).** Switching stores is configuration. Only features every candidate supports are used: multipart, presigned URLs, range reads, prefix listing, delete.
- **Avoid versioning, tagging, lifecycle rules, ACLs and server-side encryption.** The calls succeeded, but success is not proof of behaviour, and other stores differ. Cleanup of abandoned multipart uploads is the application's job.
- **One bucket, content type set on upload, filenames in Postgres, keys not URLs in Postgres.** Presign at request time.
- **Keep the checksum settings as `WHEN_REQUIRED`.** The newer SDK default worked, but this setting costs nothing and protects against a store that rejects the trailer format.

## Left open on purpose

Presigned URLs embed the host that signed them, and the browser must reach that host. Making that work (a same-origin proxy route versus CORS) was deferred to the upload ticket and decided in ADR 0005.

## Snippets

**Multipart upload through presigned part URLs** (`spikes/s3-store/.../SeaweedFsSpikeTest.java`, trimmed). Each part is a plain HTTP `PUT` to a signed URL, exactly as the browser will do it. The `ETag` of every part is collected for the completing call.

```java
var upload = s3.createMultipartUpload(CreateMultipartUploadRequest.builder()
        .bucket(BUCKET).key(key).contentType("audio/flac").build());
var completed = new ArrayList<CompletedPart>();
for (int i = 1; i <= parts; i++) {
    var data = block(i, partSize);
    var presigned = presigner.presignUploadPart(UploadPartPresignRequest.builder()
            .signatureDuration(Duration.ofMinutes(15))
            .uploadPartRequest(UploadPartRequest.builder()
                    .bucket(BUCKET).key(key).uploadId(upload.uploadId()).partNumber(i).build())
            .build());
    var response = http.send(
            HttpRequest.newBuilder(presigned.url().toURI())
                    .PUT(HttpRequest.BodyPublishers.ofByteArray(data))
                    .build(),
            HttpResponse.BodyHandlers.discarding());
    assertEquals(200, response.statusCode(), "part " + i);
    var etag = response.headers().firstValue("ETag").orElseThrow();
    completed.add(CompletedPart.builder().partNumber(i).eTag(etag).build());
}
s3.completeMultipartUpload(CompleteMultipartUploadRequest.builder()
        .bucket(BUCKET).key(key).uploadId(upload.uploadId())
        .multipartUpload(CompletedMultipartUpload.builder().parts(completed).build())
        .build());
```

**Expiry and tampering** (same file). A two-second URL, used once inside the window and once after.

```java
var shortLived = presigner.presignGetObject(GetObjectPresignRequest.builder()
        .signatureDuration(Duration.ofSeconds(2))
        .getObjectRequest(GetObjectRequest.builder().bucket(BUCKET).key(key).build())
        .build());
var before = http.send(HttpRequest.newBuilder(shortLived.url().toURI()).GET().build(),
        HttpResponse.BodyHandlers.discarding());
Thread.sleep(4000);
var after = http.send(HttpRequest.newBuilder(shortLived.url().toURI()).GET().build(),
        HttpResponse.BodyHandlers.ofString());
assertEquals(200, before.statusCode());
assertTrue(after.statusCode() == 403 || after.statusCode() == 400, "expired: " + after.statusCode());
```

**The store as Testcontainers will start it** (from the finding, reused in `TestInfrastructure`).

```java
new GenericContainer<>("chrislusf/seaweedfs:4.48")
    .withCommand("server", "-dir=/data", "-s3")
    .withEnv("AWS_ACCESS_KEY_ID", "test-access")
    .withEnv("AWS_SECRET_ACCESS_KEY", "test-secret")
    .withExposedPorts(8333)
    .waitingFor(Wait.forListeningPorts(8333));
```

**What the findings became in production** (`storage/StorageConfig.java`). Path-style addressing, an endpoint override, and the checksum setting from the finding.

```java
@Bean(destroyMethod = "close")
S3Client s3Client(StorageProperties properties) {
  return S3Client.builder()
      .endpointOverride(URI.create(properties.endpoint()))
      .region(Region.US_EAST_1)
      .credentialsProvider(credentials(properties))
      .serviceConfiguration(PATH_STYLE)
      // Not every S3-compatible store accepts the SDK's default checksum trailers.
      .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
      .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
      .build();
}
```

## Checkpoint

Run your own five-question spike against any S3-compatible container:

- [ ] A 100 MB multipart upload through presigned part URLs round-trips with the same checksum.
- [ ] A presigned URL stops working after its expiry.
- [ ] You can fetch bytes 10-19, bytes 10 to the end, and the last 10 bytes, and each answer is 206 with the right `Content-Range`.
- [ ] A range that starts past the end returns 416.
- [ ] You can state, in one line each, what would make you reject the store.

## Reference

`docs/spikes/02-seaweedfs-finding.md`, `spikes/s3-store/src/test/java/dev/ossm/spike/SeaweedFsSpikeTest.java`, `docs/adr/0001-s3-compatible-object-store.md`.
