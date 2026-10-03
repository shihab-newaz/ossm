package dev.ossm.api.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the object store is. Two addresses, because the API and the browser reach it differently:
 * the API talks to {@code endpoint} directly, while presigned URLs are signed for {@code publicUrl}
 * (the single origin Caddy serves) so a browser can use them as-is.
 */
@ConfigurationProperties("ossm.storage")
public record StorageProperties(
    String endpoint, String publicUrl, String bucket, String accessKey, String secretKey) {}
