package dev.ossm.api.ingest;

import dev.ossm.api.ingest.UploadDtos.CompleteUploadRequest;
import dev.ossm.api.ingest.UploadDtos.Upload;
import dev.ossm.api.ingest.UploadDtos.UploadPart;
import dev.ossm.api.ingest.UploadDtos.UploadStatus;
import dev.ossm.api.ingest.UploadDtos.UploadTicket;
import dev.ossm.api.storage.Bucket;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.UploadPartRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.UploadPartPresignRequest;

/**
 * The upload handshake. The API only issues presigned part URLs and finishes the multipart upload;
 * the file bytes go from the browser straight to the object store and never pass through here.
 */
@Service
class UploadService {

  private static final Duration URL_LIFETIME = Duration.ofHours(1);

  private final JdbcClient jdbc;
  private final S3Client s3;
  private final S3Presigner presigner;
  private final Bucket bucket;
  private final IngestQueue queue;
  private final IngestProperties properties;

  UploadService(
      JdbcClient jdbc,
      S3Client s3,
      S3Presigner presigner,
      Bucket bucket,
      IngestQueue queue,
      IngestProperties properties) {
    this.jdbc = jdbc;
    this.s3 = s3;
    this.presigner = presigner;
    this.bucket = bucket;
    this.queue = queue;
    this.properties = properties;
  }

  UploadTicket create(
      UUID userId, String filename, long sizeBytes, String requestedLicense, UploadKind kind) {
    if (sizeBytes > properties.maxBytes(kind)) {
      // Worded and titled like the bean-validation errors this check used to be one of.
      var problem =
          ProblemDetail.forStatusAndDetail(
              HttpStatus.BAD_REQUEST, "Files can be at most " + humanSize(kind));
      problem.setTitle("Invalid request");
      throw new ErrorResponseException(HttpStatus.BAD_REQUEST, problem, null);
    }
    if (kind == UploadKind.VIDEO) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Video uploads aren't available yet.");
    }
    final String license;
    try {
      license = Licenses.resolve(requestedLicense);
    } catch (IllegalArgumentException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
    }
    var bucketName = bucket.ensure();
    var id = UUID.randomUUID();
    var key = "audio/" + id + IngestService.extensionOf(filename);
    var multipart =
        s3.createMultipartUpload(
            CreateMultipartUploadRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType("application/octet-stream")
                .build());
    jdbc.sql(
            "insert into upload (id, user_id, filename, size_bytes, object_key, s3_upload_id, status,"
                + " license) values (:id, :user, :filename, :size, :key, :s3, 'UPLOADING', :license)")
        .param("id", id)
        .param("user", userId)
        .param("filename", filename)
        .param("size", sizeBytes)
        .param("key", key)
        .param("s3", multipart.uploadId())
        .param("license", license)
        .update();

    long partSize = PartSizing.forSize(sizeBytes);
    int count = PartSizing.partCount(sizeBytes);
    List<UploadPart> parts =
        IntStream.rangeClosed(1, count)
            .mapToObj(
                n ->
                    new UploadPart(
                        n,
                        presigner
                            .presignUploadPart(
                                UploadPartPresignRequest.builder()
                                    .signatureDuration(URL_LIFETIME)
                                    .uploadPartRequest(
                                        UploadPartRequest.builder()
                                            .bucket(bucketName)
                                            .key(key)
                                            .uploadId(multipart.uploadId())
                                            .partNumber(n)
                                            .build())
                                    .build())
                            .url()
                            .toString()))
            .toList();
    return new UploadTicket(find(userId, id).orElseThrow(), partSize, parts);
  }

  private String tooLarge(UploadKind kind) {
    return "Files can be at most " + humanSize(kind) + ".";
  }

  /** "250 MB", "20 GB". Caps are whole MB or GB in practice; anything else is shown in bytes. */
  private String humanSize(UploadKind kind) {
    long max = properties.maxBytes(kind);
    long mib = 1024L * 1024;
    long gib = 1024 * mib;
    return max % gib == 0 ? max / gib + " GB" : max % mib == 0 ? max / mib + " MB" : max + " bytes";
  }

  Upload complete(UUID userId, UUID id, CompleteUploadRequest request) {
    var row =
        jdbc.sql(
                "select object_key, s3_upload_id, status from upload where id = :id and user_id = :user")
            .param("id", id)
            .param("user", userId)
            .query((rs, i) -> new String[] {rs.getString(1), rs.getString(2), rs.getString(3)})
            .optional()
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such upload."));
    if (!row[2].equals("UPLOADING")) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This upload was already completed.");
    }
    var key = row[0];
    var bucketName = bucket.ensure();
    var parts =
        request.parts().stream()
            .sorted(Comparator.comparingInt(UploadDtos.CompletedPart::partNumber))
            .map(
                p ->
                    software.amazon.awssdk.services.s3.model.CompletedPart.builder()
                        .partNumber(p.partNumber())
                        .eTag(p.etag())
                        .build())
            .toList();
    try {
      s3.completeMultipartUpload(
          CompleteMultipartUploadRequest.builder()
              .bucket(bucketName)
              .key(key)
              .uploadId(row[1])
              .multipartUpload(CompletedMultipartUpload.builder().parts(parts).build())
              .build());
    } catch (S3Exception e) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "The upload was incomplete or damaged. Please try again.");
    }

    // The size was declared up front, but presigned URLs cannot enforce it, so check what arrived.
    var stored = s3.headObject(b -> b.bucket(bucketName).key(key)).contentLength();
    // Every upload is audio until video ingest exists (ticket 20 records the kind on the row).
    if (stored > properties.maxBytes(UploadKind.AUDIO)) {
      s3.deleteObject(b -> b.bucket(bucketName).key(key));
      jdbc.sql(
              "update upload set status = 'FAILED', error = :error, updated_at = now() where id = :id")
          .param("error", tooLarge(UploadKind.AUDIO))
          .param("id", id)
          .update();
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, tooLarge(UploadKind.AUDIO));
    }

    // Queue first, then flip the status: a job that wins the race must not be overwritten.
    queue.enqueue(id);
    jdbc.sql(
            "update upload set status = 'INGESTING', updated_at = now()"
                + " where id = :id and status = 'UPLOADING'")
        .param("id", id)
        .update();
    return find(userId, id).orElseThrow();
  }

  /** Puts a failed upload back in the queue, for when the cause (or a transient fault) is gone. */
  Upload retry(UUID userId, UUID id) {
    var current =
        find(userId, id)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such upload."));
    if (current.status() != UploadStatus.FAILED) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Only failed uploads can be retried.");
    }
    var reopened =
        jdbc.sql(
                "update upload set status = 'INGESTING', error = null, updated_at = now()"
                    + " where id = :id and user_id = :user and status = 'FAILED'")
            .param("id", id)
            .param("user", userId)
            .update();
    if (reopened == 1) {
      queue.enqueue(id);
    }
    return find(userId, id).orElseThrow();
  }

  Optional<Upload> find(UUID userId, UUID id) {
    return jdbc.sql(SELECT + " where id = :id and user_id = :user")
        .param("id", id)
        .param("user", userId)
        .query(UploadService::map)
        .optional();
  }

  List<Upload> recent(UUID userId) {
    return jdbc.sql(SELECT + " where user_id = :user order by created_at desc limit 50")
        .param("user", userId)
        .query(UploadService::map)
        .list();
  }

  private static final String SELECT =
      "select id, filename, size_bytes, status, error, track_id, created_at from upload";

  private static Upload map(ResultSet rs, int row) throws SQLException {
    return new Upload(
        rs.getObject("id", UUID.class),
        rs.getString("filename"),
        rs.getLong("size_bytes"),
        UploadStatus.valueOf(rs.getString("status")),
        rs.getString("error"),
        rs.getObject("track_id", UUID.class),
        rs.getObject("created_at", OffsetDateTime.class).toInstant());
  }
}
