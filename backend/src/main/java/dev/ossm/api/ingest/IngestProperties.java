package dev.ossm.api.ingest;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code enabled=false} queues jobs but does not run them in this process. A crashed worker's job
 * is picked up again after about six missed heartbeats.
 */
@ConfigurationProperties("ossm.ingest")
public record IngestProperties(boolean enabled, Duration heartbeatInterval) {}
