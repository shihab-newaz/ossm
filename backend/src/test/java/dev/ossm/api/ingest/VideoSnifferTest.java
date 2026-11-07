package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import dev.ossm.api.ingest.VideoSniffer.Container;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class VideoSnifferTest {

  private static byte[] ftyp(String brand) {
    var head = new byte[32];
    head[3] = 32;
    System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, head, 4, 4);
    System.arraycopy(brand.getBytes(StandardCharsets.US_ASCII), 0, head, 8, 4);
    return head;
  }

  /** An EBML header carrying a DocType element, as WebM and Matroska files begin. */
  private static byte[] ebml(String docType) {
    var type = docType.getBytes(StandardCharsets.US_ASCII);
    var head = new byte[16 + type.length];
    head[0] = 0x1A;
    head[1] = 0x45;
    head[2] = (byte) 0xDF;
    head[3] = (byte) 0xA3;
    head[4] = (byte) 0x9F;
    head[8] = 0x42;
    head[9] = (byte) 0x82;
    head[10] = (byte) (0x80 | type.length);
    System.arraycopy(type, 0, head, 11, type.length);
    return head;
  }

  @Test
  void tellsContainersApartByTheirBytes() {
    assertThat(VideoSniffer.detect(ftyp("isom"))).contains(Container.MP4);
    assertThat(VideoSniffer.detect(ftyp("M4V "))).contains(Container.MP4);
    assertThat(VideoSniffer.detect(ftyp("qt  "))).contains(Container.MOV);
    assertThat(VideoSniffer.detect(ebml("webm"))).contains(Container.WEBM);
    assertThat(VideoSniffer.detect(ebml("matroska"))).contains(Container.MKV);
  }

  @Test
  void aMatroskaHeaderWithoutADocTypeIsStillMatroska() {
    var bare = new byte[] {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, (byte) 0x80};

    assertThat(VideoSniffer.detect(bare)).contains(Container.MKV);
  }

  @Test
  void rejectsWhatIsNotAVideoContainer() {
    assertThat(
            VideoSniffer.detect("just some text, renamed to .mp4".getBytes(StandardCharsets.UTF_8)))
        .isEmpty();
    assertThat(VideoSniffer.detect(new byte[0])).isEmpty();
    // Audio is not a video, whatever the file is called.
    assertThat(
            VideoSniffer.detect(
                "ID3\u0003\0\0\0\0\0\0\0\0\0\0\0\0".getBytes(StandardCharsets.ISO_8859_1)))
        .isEmpty();
  }

  @Test
  void aFileTooShortToCarryABoxHeaderIsNotAVideo() {
    assertThat(VideoSniffer.detect(new byte[] {0, 0, 0, 8, 'f', 't', 'y', 'p'})).isEmpty();
  }
}
