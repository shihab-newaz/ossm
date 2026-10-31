# 4. Upload and ingest

Tickets 05 and 06. ADR 0005. Migrations V4 and V5.

## Goal

A logged-in user picks a file, it goes straight to the object store, and a background job turns it into a track with tags, cover art and metadata. Bad files fail with a readable reason, duplicates are recognised, and nothing is lost if the API restarts mid-job.

## The shape

```
browser                       API                         store           Postgres
   | POST /uploads (name,size)  |                            |                |
   |--------------------------->| createMultipartUpload ---->|                |
   |                            | insert upload (UPLOADING) -------------->   |
   |<-- part URLs (presigned) --|                            |                |
   | PUT part 1..n -------------------------------------->   |                |
   | POST /uploads/{id}/complete (etags)                     |                |
   |--------------------------->| completeMultipartUpload -->|                |
   |                            | headObject (size check) -->|                |
   |                            | enqueue job, then status = INGESTING ----->|
   |                                                                          |
   |                  worker: read object, sniff, tags, hash, cover, persist  |
   |                  upload -> DONE | DUPLICATE | FAILED(reason)             |
```

The API never sees the file bytes on the way in.

## Learn first

- Multipart upload and presigned part URLs (rung 2), and why part URLs are signed for a host the browser can reach.
- Idempotency: what it means for a job to be "safe to run twice".
- A Postgres-backed job queue: rows, a polling worker, heartbeats, and how a crashed worker's job is recovered.
- Content sniffing: identifying a file by magic numbers, not extension.
- Exponential backoff, and the difference between a transient failure (retry) and a terminal one (tell the user).
- Reading audio tags on the JVM, and what a library cannot do.

## Procedure

1. **Schema (V4).** `artist`, `album`, `track` and `upload` tables, plus db-scheduler's `scheduled_tasks` table as a Flyway migration. Artists and albums carry a normalised `*_key` column with a unique constraint, so "Daft Punk" and " daft punk " are one artist. `upload.status` has a check constraint.
2. **Storage.** One configurable bucket, created if missing. Two addresses: the API's own endpoint, and the public URL that presigned links are signed for.
3. **Make presigned URLs reachable.** Sign for the public address and route the bucket path through the reverse proxy on the same origin, passing Host and path through unchanged so the signature still verifies. No CORS needed, and the store has no published port.
4. **Create upload.** Validate the licence, create the multipart upload, insert an `upload` row as `UPLOADING`, and return one presigned URL per part. Part size is 16 MiB.
5. **Complete upload.** Check the row belongs to the caller and is still `UPLOADING`. Complete the multipart upload, then `headObject` and enforce the 250 MB cap on the stored size, because a presigned URL cannot limit size. Enqueue the job first, then set `INGESTING` with a guarded update, so a job that wins the race is not overwritten.
6. **The queue port.** `IngestQueue.enqueue(uploadId)` is durable and safe to call twice. The Postgres adapter uses db-scheduler's core library (the Boot starter targets Boot 3).
7. **The job.**
   - Skip unless the upload is `UPLOADING` or `INGESTING`.
   - Download to a temp directory, computing SHA-256 while streaming.
   - Sniff the format from bytes. Unknown means a terminal failure with a reason.
   - Read tags, cover and duration. Apply the fallbacks (filename as title, "Unknown Artist").
   - If a track with this hash exists, end as `DUPLICATE` and delete the new object.
   - Store the cover content-addressed, compute the album's dominant colour, and write artist, album and track in one transaction.
   - Catch the unique-index violation for the case of two identical files at the same moment.
8. **Retry policy.** Unexpected exceptions throw, and the scheduler retries: 30 s doubling to a 30 min cap, five attempts. After that the upload becomes `FAILED` with a reason and the user can retry from the UI. A pure `RetryPolicy` class holds the schedule so it can be unit-tested.
9. **Admin view.** Admins see everyone's failures at `/api/v1/admin/ingest-failures`.
10. **Hardening (V5).** Licence column, a `DUPLICATE` status, a *partial* unique index on `track.content_hash` (so the database, not only the code, guarantees one track per file), and a partial index for failed uploads.

## Decisions and why (ADR 0005)

- **Direct upload, API as the handshake.** Files are up to 250 MB; they should not pass through the API.
- **Postgres as the queue.** One dependency to run and back up, and jobs live in a table Flyway owns. The port keeps this replaceable.
- **Format by bytes.** MP3 needs two consistent frames in a row, because a single matching byte pair is common in binary data.
- **Dedupe by hash in Postgres, not by renaming objects.** Copying 250 MB objects to rename them only adds a failure mode. Audio keys stay `audio/<upload-id>.<ext>`; covers are content-addressed.
- **A small in-house reader for Opus.** The tag library cannot read it, so `OpusReader` parses the two header packets and the last page's granule position.
- **The tag library sits behind `TagReader`.** It is old, so it must be replaceable.

## Pitfalls hit

These came from running real files after the synthetic fixtures passed:

- MP4 files with the `dash` brand (video-site downloads) were rejected.
- A WebM file passed as MP3 on a single stray byte pair. This is why MP3 sniffing now needs two consistent frames.
- Segmented MP4 reports no bitrate, so it is now estimated from size and duration.
- WAV files carry no track number through the tag library.
- Cached Spring contexts from other test classes kept polling the shared database and stole the restart test's job. The restart tests now run in their own JVM (rung 8).

## Snippets

Excerpts from the repo at `f2948f2`, trimmed where marked `...`.

**Two addresses for one store** (`storage/StorageConfig.java`). The API talks to the store on `endpoint`. Presigned URLs are signed for `publicUrl`, the address the browser reaches (Caddy routes the bucket path to the store on that origin). The signature covers the host, so this split is what makes direct upload work.

```java
@Bean(destroyMethod = "close")
S3Presigner s3Presigner(StorageProperties properties) {
  return S3Presigner.builder()
      .endpointOverride(URI.create(properties.publicUrl()))
      .region(Region.US_EAST_1)
      .credentialsProvider(credentials(properties))
      .serviceConfiguration(PATH_STYLE)
      .build();
}
```

**Creating an upload** (`ingest/UploadService.java`). One multipart upload, one `upload` row, and a presigned URL per part.

```java
var bucketName = bucket.ensure();
var id = UUID.randomUUID();
var key = "audio/" + id + IngestService.extensionOf(filename);   // extension is allow-listed
var multipart =
    s3.createMultipartUpload(
        CreateMultipartUploadRequest.builder()
            .bucket(bucketName).key(key).contentType("application/octet-stream").build());
jdbc.sql("insert into upload (id, user_id, filename, size_bytes, object_key, s3_upload_id,"
        + " status, license) values (:id, :user, :filename, :size, :key, :s3, 'UPLOADING', :license)")
    .param("id", id).param("user", userId).param("filename", filename)
    .param("size", sizeBytes).param("key", key).param("s3", multipart.uploadId())
    .param("license", license)
    .update();

int count = (int) ((sizeBytes + PART_SIZE - 1) / PART_SIZE);       // PART_SIZE = 16 MiB
List<UploadPart> parts =
    IntStream.rangeClosed(1, count)
        .mapToObj(n -> new UploadPart(n, presigner.presignUploadPart(
            UploadPartPresignRequest.builder()
                .signatureDuration(URL_LIFETIME)                    // 1 hour
                .uploadPartRequest(UploadPartRequest.builder()
                    .bucket(bucketName).key(key)
                    .uploadId(multipart.uploadId()).partNumber(n).build())
                .build()).url().toString()))
        .toList();
```

**Completing it** (same file). Check what actually arrived, because a presigned URL cannot limit size. Enqueue first, then flip the status with a guarded update.

```java
// The size was declared up front, but presigned URLs cannot enforce it, so check what arrived.
var stored = s3.headObject(b -> b.bucket(bucketName).key(key)).contentLength();
if (stored > UploadDtos.MAX_BYTES) {
  s3.deleteObject(b -> b.bucket(bucketName).key(key));
  jdbc.sql("update upload set status = 'FAILED', error = :error, updated_at = now() where id = :id")
      .param("error", "Files can be at most 250 MB.")
      .param("id", id)
      .update();
  throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Files can be at most 250 MB.");
}

// Queue first, then flip the status: a job that wins the race must not be overwritten.
queue.enqueue(id);
jdbc.sql("update upload set status = 'INGESTING', updated_at = now()"
        + " where id = :id and status = 'UPLOADING'")
    .param("id", id)
    .update();
```

**The queue port and its Postgres adapter** (`ingest/IngestQueue.java`, `DbSchedulerIngestQueue.java`).

```java
public interface IngestQueue {
  /** Durable: once this returns, the job survives an API restart. Safe to call twice. */
  void enqueue(UUID uploadId);
}
```

```java
this.task =
    Tasks.oneTime(TASK_NAME, Void.class)
        .onFailure(retryWithBackoff(ingest))
        .execute((instance, context) -> ingest.ingest(UUID.fromString(instance.getId())));
this.scheduler =
    Scheduler.create(dataSource, task)
        .threads(2)
        .pollingInterval(Duration.ofSeconds(1))
        .heartbeatInterval(properties.heartbeatInterval())
        .shutdownMaxWait(Duration.ofSeconds(30))
        .enableImmediateExecution()
        .build();

@Override
public void enqueue(UUID uploadId) {
  var instance = task.instance(uploadId.toString());
  // schedule() refuses a duplicate id, which is exactly "safe to call twice".
  if (scheduler.getScheduledExecution(instance).isEmpty()) {
    scheduler.schedule(instance, Instant.now());
  }
}
```

**The retry schedule, pure** (`ingest/RetryPolicy.java`). No clock, no database, so it is a plain unit test.

```java
static final int MAX_ATTEMPTS = 5;
private static final Duration FIRST_DELAY = Duration.ofSeconds(30);
private static final Duration MAX_DELAY = Duration.ofMinutes(30);

static boolean shouldRetry(int consecutiveFailures) {
  return consecutiveFailures < MAX_ATTEMPTS;
}

/** Wait before the next attempt: 30 s, 1 min, 2 min, 4 min, ... capped at 30 minutes. */
static Duration delayAfter(int consecutiveFailures) {
  var exponent = Math.max(0, Math.min(consecutiveFailures - 1, 20));
  var delay = FIRST_DELAY.multipliedBy(1L << exponent);
  return delay.compareTo(MAX_DELAY) > 0 ? MAX_DELAY : delay;
}
```

**The job, idempotent by construction** (`ingest/IngestService.java`, trimmed). Read it as a series of guards.

```java
void ingest(UUID uploadId) {
  var upload = /* select ... from upload where id = :id */ ...;
  if (upload.isEmpty()
      || !(upload.get().status().equals("UPLOADING") || upload.get().status().equals("INGESTING"))) {
    return;                                   // finished or failed already: nothing to do
  }
  ...
  var sha256 = download(row.objectKey(), downloaded);          // hashes while streaming to disk
  // What the bytes are decides how they are read; the uploaded file name is never trusted.
  var format = AudioSniffer.detect(downloaded);
  if (format.isEmpty()) {
    fail(uploadId, TagReader.UNSUPPORTED);
    return;
  }
  ...
  var existing = trackWithHash(sha256);
  if (existing.isPresent()) {
    markDuplicate(row, existing.get());
    return;
  }
  ...
  try {
    transaction.executeWithoutResult(status -> persist(row, parsed, sha256, coverKey, dominantColor));
  } catch (DuplicateKeyException race) {
    // Two identical files were ingested at the same moment; the other one won.
    markDuplicate(row, trackWithHash(sha256).orElseThrow(() -> race));
  }
}

private String download(String key, Path target) throws IOException {
  var digest = sha256();
  try (var in = s3.getObject(b -> b.bucket(bucket.ensure()).key(key));
      var out = Files.newOutputStream(target)) {
    var buffer = new byte[64 * 1024];
    for (int n; (n = in.read(buffer)) > 0; ) {
      digest.update(buffer, 0, n);
      out.write(buffer, 0, n);
    }
  }
  return HexFormat.of().formatHex(digest.digest());
}
```

**Normalised artists with one statement** (same file). `on conflict ... returning id` is a race-free "get or create".

```java
private UUID upsertArtist(String name) {
  return jdbc.sql(
          "insert into artist (id, name, name_key) values (:id, :name, :key)"
              + " on conflict (name_key) do update set name = artist.name returning id")
      .param("id", UUID.randomUUID())
      .param("name", name)
      .param("key", TagFallbacks.key(name))      // lower-cased, trimmed identity
      .query(UUID.class)
      .single();
}
```

**The database as the last guard** (`V5__ingest_hardening.sql`). A *partial* unique index: tracks without a hash are not constrained.

```sql
-- The database, not just the ingest code, guarantees one track per distinct file.
CREATE UNIQUE INDEX track_content_hash_unique ON track (content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX upload_failed_ix ON upload (updated_at DESC) WHERE status = 'FAILED';
```

## Checkpoint

- [ ] The API test for the presigned flow proves the API never handled the file bytes.
- [ ] An unauthenticated client cannot create an upload or read its status.
- [ ] Each supported format ingests with correct title, artist, album, duration, codec and bitrate.
- [ ] A text file renamed `.mp3` is rejected with a readable reason.
- [ ] A file over the cap is rejected even if the client skips its own check.
- [ ] Uploading the same file twice leaves one track and the second upload ends `DUPLICATE`.
- [ ] A file with no tags ingests with the filename as title and "Unknown Artist".
- [ ] Kill the app after a job is queued and before it runs; start it again; the job completes.
- [ ] A failed upload shows its reason, and retry works once the cause is gone.
- [ ] Pure unit tests cover the retry schedule, tag fallbacks and dominant colour.

## Reference code

`ingest/` (`UploadsController`, `UploadService`, `IngestService`, `IngestQueue`, `DbSchedulerIngestQueue`, `RetryPolicy`, `AudioSniffer`, `TagReader`, `TagFallbacks`, `OpusReader`, `DominantColor`), `storage/` (`Bucket`, `StorageConfig`), `V4__library_and_ingest.sql`, `V5__ingest_hardening.sql`. Tests: `IngestFlowTest`, `IngestHardeningTest`, `IngestSurvivesRestartTest`, and in `ingest/`: `AudioSnifferTest`, `RetryPolicyTest`, `TagReaderTest`, `TagReaderFormatsTest`, `DominantColorTest`, `IngestGiveUpTest`.
