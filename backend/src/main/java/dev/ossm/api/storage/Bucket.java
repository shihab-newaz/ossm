package dev.ossm.api.storage;

import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;

/** The one bucket OSSM uses. Created on first need, so a store that starts late is not fatal. */
@Component
public class Bucket implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(Bucket.class);

  private final S3Client s3;
  private final String name;
  private final AtomicBoolean ready = new AtomicBoolean();

  Bucket(S3Client s3, StorageProperties properties) {
    this.s3 = s3;
    this.name = properties.bucket();
  }

  public String name() {
    return name;
  }

  /** Makes sure the bucket exists. Cheap after the first success. */
  public String ensure() {
    if (!ready.get()) {
      try {
        s3.headBucket(b -> b.bucket(name));
      } catch (NoSuchBucketException e) {
        create();
      } catch (software.amazon.awssdk.services.s3.model.S3Exception e) {
        if (e.statusCode() == 404) {
          create();
        } else {
          throw e;
        }
      }
      ready.set(true);
    }
    return name;
  }

  private void create() {
    try {
      s3.createBucket(b -> b.bucket(name));
    } catch (BucketAlreadyOwnedByYouException ignored) {
      // Another instance won the race.
    }
  }

  /**
   * Best effort at startup; uploads call {@link #ensure()} themselves if the store was not up yet.
   */
  @Override
  public void run(ApplicationArguments args) {
    try {
      ensure();
    } catch (RuntimeException e) {
      log.warn("Object store not ready at startup; will retry on first upload: {}", e.toString());
    }
  }
}
