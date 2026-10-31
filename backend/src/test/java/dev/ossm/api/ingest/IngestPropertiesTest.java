package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
  void aCapOfZeroOrLessStopsStartupWithAClearReason() {
    assertThatThrownBy(() -> bind(Map.of("ossm.ingest.max-audio-bytes", "-1MB")))
        .rootCause()
        .hasMessage("ossm.ingest.max-audio-bytes must be more than 0, but was -1048576B");
    assertThatThrownBy(() -> bind(Map.of("ossm.ingest.max-video-bytes", "0B")))
        .rootCause()
        .hasMessage("ossm.ingest.max-video-bytes must be more than 0, but was 0B");
  }

  @Test
  void theOperatorCanChangeEachCap() {
    var props =
        bind(Map.of("ossm.ingest.max-audio-bytes", "100MB", "ossm.ingest.max-video-bytes", "4GB"));

    assertThat(props.maxBytes(UploadKind.AUDIO)).isEqualTo(DataSize.ofMegabytes(100).toBytes());
    assertThat(props.maxBytes(UploadKind.VIDEO)).isEqualTo(DataSize.ofGigabytes(4).toBytes());
  }
}
