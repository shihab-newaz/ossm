package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Pure tests for the parts of tag reading that involve no storage or database. */
class TagReaderTest {

  @Test
  void trackNumbersAcceptTheCommonForms() {
    assertThat(TagReader.leadingNumber("3")).isEqualTo(3);
    assertThat(TagReader.leadingNumber("3/12")).isEqualTo(3);
    assertThat(TagReader.leadingNumber("03")).isEqualTo(3);
    assertThat(TagReader.leadingNumber(" 7 of 9")).isEqualTo(7);
    assertThat(TagReader.leadingNumber("0")).isNull();
    assertThat(TagReader.leadingNumber("abc")).isNull();
    assertThat(TagReader.leadingNumber("")).isNull();
    assertThat(TagReader.leadingNumber(null)).isNull();
    assertThat(TagReader.leadingNumber("99999999999")).isNull();
  }

  @Test
  void yearsAreTheLeadingFourDigits() {
    assertThat(TagReader.year("2013")).isEqualTo(2013);
    assertThat(TagReader.year("2013-05-01")).isEqualTo(2013);
    assertThat(TagReader.year("May 2013")).isNull();
    assertThat(TagReader.year("13")).isNull();
    assertThat(TagReader.year(null)).isNull();
  }

  @Test
  void aMissingBitrateIsEstimatedFromSizeAndDuration() {
    // 4,472,652 bytes over 282 seconds is about 127 kbps.
    assertThat(TagReader.effectiveBitrate(null, 4_472_652, 282_000)).isEqualTo(127);
    assertThat(TagReader.effectiveBitrate(0, 1_000_000, 10_000)).isEqualTo(800);
    assertThat(TagReader.effectiveBitrate(320, 1, 1))
        .as("a header value always wins")
        .isEqualTo(320);
    assertThat(TagReader.effectiveBitrate(null, 0, 1_000)).isNull();
    assertThat(TagReader.effectiveBitrate(null, 1_000, 0)).isNull();
  }

  @Test
  void codecsGetShortStableNames() {
    assertThat(TagReader.codecName("MPEG-1 Layer 3")).isEqualTo("mp3");
    assertThat(TagReader.codecName("mp3")).isEqualTo("mp3");
    assertThat(TagReader.codecName("FLAC 16 bits")).isEqualTo("flac");
    assertThat(TagReader.codecName("AAC")).isEqualTo("aac");
    assertThat(TagReader.codecName("Ogg Vorbis v1")).isEqualTo("vorbis");
    assertThat(TagReader.codecName("")).isNull();
    assertThat(TagReader.codecName(null)).isNull();
  }

  @Test
  void aTextFileIsNotAudio(@TempDir Path dir) throws IOException {
    var file = Files.writeString(dir.resolve("notes.mp3"), "just words, not audio ".repeat(100));

    var error =
        org.junit.jupiter.api.Assertions.assertThrows(
            TagReader.UnreadableAudioException.class, () -> TagReader.read(file));

    assertThat(error.getMessage()).contains("supported audio file");
  }

  @Test
  void aFileWithTheWrongExtensionIsNotGuessedAt(@TempDir Path dir) throws IOException {
    var png =
        Base64.getDecoder()
            .decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
    var file = Files.write(dir.resolve("cover.mp3"), png);

    org.junit.jupiter.api.Assertions.assertThrows(
        TagReader.UnreadableAudioException.class, () -> TagReader.read(file));
  }
}
