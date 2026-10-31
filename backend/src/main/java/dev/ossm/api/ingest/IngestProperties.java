package dev.ossm.api.ingest;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

/**
 * {@code enabled=false} queues jobs but does not run them in this process. A crashed worker's job
 * is picked up again after about six missed heartbeats. Each upload kind has its own size cap.
 */
@ConfigurationProperties("ossm.ingest")
public record IngestProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("15s") Duration heartbeatInterval,
    @DefaultValue("250MB") DataSize maxAudioBytes,
    @DefaultValue("20GB") DataSize maxVideoBytes) {

  long maxBytes(UploadKind kind) {
    return switch (kind) {
      case AUDIO -> maxAudioBytes.toBytes();
      case VIDEO -> maxVideoBytes.toBytes();
    };
  }

  /** "250 MB", "20 GB". Caps are whole MB or GB in practice; anything else is shown in bytes. */
  String capText(UploadKind kind) {
    long max = maxBytes(kind);
    long mb = DataSize.ofMegabytes(1).toBytes();
    long gb = DataSize.ofGigabytes(1).toBytes();
    return max % gb == 0 ? max / gb + " GB" : max % mb == 0 ? max / mb + " MB" : max + " bytes";
  }
}
