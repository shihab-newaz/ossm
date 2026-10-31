package dev.ossm.api.storage;

import java.net.URI;
import java.time.Duration;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * Short-lived read URLs signed for the store's internal address, for tools on the API's side (like
 * ffprobe, ADR 0009) that read an object by range over HTTP. They are never sent to a browser.
 */
@Component
public class InternalUrls implements AutoCloseable {

  private final S3Presigner presigner;
  private final Bucket bucket;

  InternalUrls(StorageProperties properties, Bucket bucket) {
    this.bucket = bucket;
    this.presigner =
        S3Presigner.builder()
            .endpointOverride(URI.create(properties.endpoint()))
            .region(Region.US_EAST_1)
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(properties.accessKey(), properties.secretKey())))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .build();
  }

  /** A GET URL for one object, valid for the given time. */
  public String read(String key, Duration lifetime) {
    return presigner
        .presignGetObject(
            b ->
                b.signatureDuration(lifetime)
                    .getObjectRequest(g -> g.bucket(bucket.ensure()).key(key)))
        .url()
        .toString();
  }

  @Override
  public void close() {
    presigner.close();
  }
}
