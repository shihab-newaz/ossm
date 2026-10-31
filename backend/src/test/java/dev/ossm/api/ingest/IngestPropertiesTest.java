package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.util.unit.DataSize;

class IngestPropertiesTest {

  private static IngestProperties bind(Map<String, String> values) {
    return new Binder(new MapConfigurationPropertySource(values))
        .bindOrCreate("ossm.ingest", IngestProperties.class);
  }

  @Test
  void capsDefaultTo250MbForAudioAnd20GbForVideo() {
    var props = bind(Map.of());

    assertThat(props.maxBytes(UploadKind.AUDIO)).isEqualTo(DataSize.ofMegabytes(250).toBytes());
    assertThat(props.maxBytes(UploadKind.VIDEO)).isEqualTo(DataSize.ofGigabytes(20).toBytes());
  }

  @Test
  void theOperatorCanChangeEachCap() {
    var props =
        bind(Map.of("ossm.ingest.max-audio-bytes", "100MB", "ossm.ingest.max-video-bytes", "4GB"));

    assertThat(props.maxBytes(UploadKind.AUDIO)).isEqualTo(DataSize.ofMegabytes(100).toBytes());
    assertThat(props.maxBytes(UploadKind.VIDEO)).isEqualTo(DataSize.ofGigabytes(4).toBytes());
  }
}
