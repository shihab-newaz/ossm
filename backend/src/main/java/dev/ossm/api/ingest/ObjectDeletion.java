package dev.ossm.api.ingest;

import dev.ossm.api.storage.Bucket;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;

/** The deletion job's work: empties a prefix and checks that the store agrees it is empty. */
@Service
class ObjectDeletion {

  /** S3 deletes at most this many keys in one request. */
  private static final int BATCH = 1000;

  private final S3Client s3;
  private final Bucket bucket;

  ObjectDeletion(S3Client s3, Bucket bucket) {
    this.s3 = s3;
    this.bucket = bucket;
  }

  /**
   * Throws if anything is left, so the job is retried. Deleting nothing is fine: the prefix may
   * already be gone from an earlier attempt.
   */
  void deletePrefix(String prefix) {
    var bucketName = bucket.ensure();
    var keys =
        s3.listObjectsV2Paginator(b -> b.bucket(bucketName).prefix(prefix)).contents().stream()
            .map(object -> ObjectIdentifier.builder().key(object.key()).build())
            .toList();
    for (int from = 0; from < keys.size(); from += BATCH) {
      var batch = keys.subList(from, Math.min(keys.size(), from + BATCH));
      var result =
          s3.deleteObjects(
              b ->
                  b.bucket(bucketName).delete(Delete.builder().objects(batch).quiet(true).build()));
      if (result.hasErrors()) {
        throw new IllegalStateException(
            "The store could not delete " + result.errors().size() + " objects under " + prefix);
      }
    }
    // Only an empty listing confirms the prefix is gone.
    if (s3.listObjectsV2(b -> b.bucket(bucketName).prefix(prefix).maxKeys(1)).keyCount() > 0) {
      throw new IllegalStateException("Objects remain under " + prefix);
    }
  }
}
