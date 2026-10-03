package dev.ossm.api.storage;

import java.net.URI;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * The only place that knows how to talk to the object store: the AWS SDK with a custom endpoint.
 */
@Configuration
@EnableConfigurationProperties(StorageProperties.class)
class StorageConfig {

  private static final S3Configuration PATH_STYLE =
      S3Configuration.builder().pathStyleAccessEnabled(true).build();

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

  @Bean(destroyMethod = "close")
  S3Presigner s3Presigner(StorageProperties properties) {
    return S3Presigner.builder()
        .endpointOverride(URI.create(properties.publicUrl()))
        .region(Region.US_EAST_1)
        .credentialsProvider(credentials(properties))
        .serviceConfiguration(PATH_STYLE)
        .build();
  }

  private static StaticCredentialsProvider credentials(StorageProperties properties) {
    return StaticCredentialsProvider.create(
        AwsBasicCredentials.create(properties.accessKey(), properties.secretKey()));
  }
}
