package dev.ossm.api.ingest;

import dev.ossm.api.ingest.VideoSniffer.Container;
import dev.ossm.api.storage.Bucket;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * The ingest of a video upload (ADR 0010): read the original back from the store once, check its
 * first bytes say it is a video container, fingerprint it with a streaming SHA-256, and either
 * record it in its owner's vault or call it a duplicate of a video already there. The server never
 * decodes the file and never writes a copy of it to disk. The original in the store is not touched.
 */
@Service
class VideoIngest {

  static final String UNSUPPORTED =
      "This isn't a supported video file. MP4, M4V, MOV, WebM and MKV work.";

  private static final Logger log = LoggerFactory.getLogger(VideoIngest.class);

  /** The bytes are not a video. The message is for the person who uploaded them. */
  static final class Rejected extends RuntimeException {
    Rejected(String reason) {
      super(reason);
    }
  }

  private final JdbcClient jdbc;
  private final S3Client s3;
  private final Bucket bucket;
  private final TransactionTemplate transaction;
  private final ObjectDeletionQueue deletions;

  VideoIngest(
      JdbcClient jdbc,
      S3Client s3,
      Bucket bucket,
      TransactionTemplate transaction,
      ObjectDeletionQueue deletions) {
    this.jdbc = jdbc;
    this.s3 = s3;
    this.bucket = bucket;
    this.transaction = transaction;
    this.deletions = deletions;
  }

  private record Fingerprint(Container container, String sha256, long sizeBytes) {}

  /** Safe to run again after a crash: the database writes happen in one transaction. */
  void ingest(IngestService.UploadRow upload) throws IOException {
    var fingerprint = fingerprint(upload.objectKey());
    var existing = videoWithHash(upload.userId(), fingerprint.sha256());
    if (existing.isPresent()) {
      markDuplicate(upload, existing.get());
      return;
    }
    try {
      transaction.executeWithoutResult(status -> persist(upload, fingerprint));
      log.info("Ingested video {} ({} bytes)", upload.id(), fingerprint.sizeBytes());
    } catch (DuplicateKeyException race) {
      // Two identical files were ingested at the same moment; the other one won.
      markDuplicate(
          upload, videoWithHash(upload.userId(), fingerprint.sha256()).orElseThrow(() -> race));
    }
  }

  /**
   * One pass over the stored object. A file that isn't a video is dropped after its first bytes.
   */
  private Fingerprint fingerprint(String key) throws IOException {
    var digest = sha256();
    try (var in = s3.getObject(b -> b.bucket(bucket.ensure()).key(key))) {
      var head = in.readNBytes(VideoSniffer.HEAD_BYTES);
      var container = VideoSniffer.detect(head);
      if (container.isEmpty()) {
        in.abort();
        throw new Rejected(UNSUPPORTED);
      }
      digest.update(head);
      long size = head.length;
      var buffer = new byte[64 * 1024];
      for (int n; (n = in.read(buffer)) > 0; ) {
        digest.update(buffer, 0, n);
        size += n;
      }
      return new Fingerprint(container.get(), HexFormat.of().formatHex(digest.digest()), size);
    }
  }

  private Optional<UUID> videoWithHash(UUID ownerId, String sha256) {
    return jdbc.sql("select id from video where owner_id = :owner and content_hash = :hash")
        .param("owner", ownerId)
        .param("hash", sha256)
        .query(UUID.class)
        .optional();
  }

  /**
   * The owner already has these bytes: point the upload at that video and ask for this copy's
   * folder in the store to be removed. Both happen in one transaction, so the upload never says
   * DUPLICATE without the removal being queued, and the removal is retried until the store agrees.
   */
  private void markDuplicate(IngestService.UploadRow upload, UUID existingVideo) {
    transaction.executeWithoutResult(
        status -> {
          var changed =
              jdbc.sql(
                      "update upload set status = 'DUPLICATE', video_id = :video, error = null,"
                          + " updated_at = now() where id = :id"
                          + " and status in ('UPLOADING', 'INGESTING')")
                  .param("video", existingVideo)
                  .param("id", upload.id())
                  .update();
          if (changed == 1) {
            deletions.deletePrefix(prefixOf(upload.objectKey()));
          }
        });
    log.info("Upload {} duplicates video {}", upload.id(), existingVideo);
  }

  private void persist(IngestService.UploadRow upload, Fingerprint fingerprint) {
    // The video's id is its upload's id, which is also what its object key was built from.
    jdbc.sql(
            "insert into video (id, owner_id, title, original_filename, container, object_key,"
                + " size_bytes, content_hash) values (:id, :owner, :title, :filename, :container,"
                + " :key, :size, :hash)")
        .param("id", upload.id())
        .param("owner", upload.userId())
        .param("title", TagFallbacks.title(null, upload.filename()))
        .param("filename", upload.filename())
        .param("container", fingerprint.container().name())
        .param("key", upload.objectKey())
        .param("size", fingerprint.sizeBytes())
        .param("hash", fingerprint.sha256())
        .update();
    var finished =
        jdbc.sql(
                "update upload set status = 'DONE', video_id = :video, error = null,"
                    + " updated_at = now() where id = :id and status in ('UPLOADING', 'INGESTING')")
            .param("video", upload.id())
            .param("id", upload.id())
            .update();
    if (finished == 0) {
      // Someone else finished or failed this upload meanwhile; undo our video.
      throw new IllegalStateException("Upload " + upload.id() + " is no longer being ingested");
    }
  }

  /** Everything an upload stored lives under one folder: {@code video/<owner>/<video>/}. */
  static String prefixOf(String objectKey) {
    var prefix = objectKey.substring(0, objectKey.lastIndexOf('/') + 1);
    // This feeds a delete, so a key from anywhere else must never reach it as a wide prefix.
    if (!prefix.startsWith("video/") || prefix.equals("video/")) {
      throw new IllegalArgumentException("Not a video object key: " + objectKey);
    }
    return prefix;
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
