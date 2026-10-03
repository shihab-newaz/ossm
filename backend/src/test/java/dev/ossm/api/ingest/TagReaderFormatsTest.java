package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Every supported format gives back the same tags, a sane duration, and its codec. */
class TagReaderFormatsTest {

  @TempDir Path dir;

  /**
   * Reads a fixture the way ingest does: sniff its format, name the file for that format, parse.
   */
  private TagReader.Parsed readLikeIngest(String file) throws Exception {
    var source = Path.of("src", "test", "resources", "audio", file);
    var format = AudioSniffer.detect(source).orElseThrow();
    var named = Files.copy(source, dir.resolve("audio" + format.extension()));
    return TagReader.read(named);
  }

  @ParameterizedTest
  @CsvSource({
    "tone.flac,flac",
    "tone.m4a,aac",
    "tone.ogg,vorbis",
    "tone.opus,opus",
    "tone.wav,wav"
  })
  void readsTagsDurationAndCodec(String file, String codec) throws Exception {
    var parsed = readLikeIngest(file);

    assertThat(parsed.title()).isEqualTo("ToneTitle");
    assertThat(parsed.artist()).isEqualTo("ToneArtist");
    assertThat(parsed.album()).isEqualTo("ToneAlbum");
    // WAV has no standard track-number field; the others carry it.
    assertThat(parsed.trackNumber()).isEqualTo(codec.equals("wav") ? null : 4);
    assertThat(parsed.year()).isEqualTo(2020);
    assertThat(parsed.genre()).isEqualTo("Test");
    assertThat(parsed.durationMs()).isBetween(1_800L, 2_300L);
    assertThat(parsed.codec()).isEqualTo(codec);
  }

  @ParameterizedTest
  @CsvSource({"tone.flac", "tone.m4a"})
  void extractsEmbeddedCoverArt(String file) throws Exception {
    var parsed = readLikeIngest(file);

    assertThat(parsed.cover()).isNotNull();
    assertThat(parsed.cover().mimeType()).isEqualTo("image/png");
    // The tone files carry an orange cover; ffmpeg's colour conversion shifts it by a few units.
    var color = DominantColor.of(parsed.cover().bytes()).orElseThrow();
    assertThat(Integer.parseInt(color.substring(1, 3), 16)).isBetween(0xE8 - 6, 0xE8 + 6);
    assertThat(Integer.parseInt(color.substring(3, 5), 16)).isBetween(0x64 - 6, 0x64 + 6);
    assertThat(Integer.parseInt(color.substring(5, 7), 16)).isBetween(0x2C - 6, 0x2C + 6);
  }
}
