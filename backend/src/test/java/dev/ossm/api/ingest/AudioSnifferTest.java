package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class AudioSnifferTest {

  private static Path fixture(String name) {
    return Path.of("src", "test", "resources", "audio", name);
  }

  @ParameterizedTest
  @CsvSource({"tone.flac,FLAC", "tone.m4a,M4A", "tone.ogg,OGG", "tone.opus,OPUS", "tone.wav,WAV"})
  void recognisesEachFormatFromItsBytes(String file, AudioFormat expected) throws IOException {
    assertThat(AudioSniffer.detect(fixture(file))).contains(expected);
  }

  @Test
  void recognisesAnMp3WithAndWithoutId3Tags(@TempDir Path dir) throws IOException {
    var plain =
        Files.write(
            dir.resolve("plain.bin"),
            dev.ossm.api.Mp3Fixture.mp3(dev.ossm.api.Mp3Fixture.Tags.none()));
    var tagged =
        Files.write(
            dir.resolve("tagged.bin"),
            dev.ossm.api.Mp3Fixture.mp3(
                new dev.ossm.api.Mp3Fixture.Tags(
                    "T", "A", "B", null, 1, 2020, dev.ossm.api.Mp3Fixture.PNG)));

    assertThat(AudioSniffer.detect(plain)).contains(AudioFormat.MP3);
    assertThat(AudioSniffer.detect(tagged)).contains(AudioFormat.MP3);
  }

  @Test
  void theNameNeverMattersOnlyTheContent(@TempDir Path dir) throws IOException {
    var flacCalledMp3 = Files.copy(fixture("tone.flac"), dir.resolve("song.mp3"));
    var textCalledMp3 =
        Files.writeString(
            dir.resolve("notes.mp3"), "Lorem ipsum, definitely not audio. ".repeat(40));

    assertThat(AudioSniffer.detect(flacCalledMp3)).contains(AudioFormat.FLAC);
    assertThat(AudioSniffer.detect(textCalledMp3)).isEmpty();
  }

  @Test
  void rejectsFilesThatAreNotSupportedAudio() throws IOException {
    var webm = new byte[] {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, 0, 0, 0, 0, 0, 0, 0, 0};
    var png = new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
    var mp4Video = new byte[] {0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'M', '4', 'V', ' '};
    var empty = new byte[0];
    var adts = new byte[] {(byte) 0xFF, (byte) 0xF1, 0x50, (byte) 0x80, 0, 0, 0, 0};

    assertThat(AudioSniffer.detect(webm)).isEqualTo(Optional.empty());
    assertThat(AudioSniffer.detect(png)).isEmpty();
    assertThat(AudioSniffer.detect(mp4Video)).isEmpty();
    assertThat(AudioSniffer.detect(empty)).isEmpty();
    assertThat(AudioSniffer.detect(adts)).as("raw AAC is not MP3").isEmpty();
  }

  @Test
  void aLoneMpegLookingBytePairInOtherDataIsNotAnMp3() {
    // A WebM header with an accidental frame-sync-like sequence deep inside, as binary data has.
    var data = new byte[2000];
    data[0] = 0x1A;
    data[1] = 0x45;
    data[2] = (byte) 0xDF;
    data[3] = (byte) 0xA3;
    data[900] = (byte) 0xFF;
    data[901] = (byte) 0xFB;
    data[902] = (byte) 0x90;
    data[903] = 0x00;

    assertThat(AudioSniffer.detect(data)).isEmpty();
  }

  @Test
  void aDashSegmentedMp4AudioFileIsM4a() {
    // ftyp box: major brand "dash", compatible brands iso6 and mp41 (as saved from video sites).
    var head =
        new byte[] {
          0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'd', 'a', 's', 'h', 0, 0, 0, 0, 'i', 's', 'o', '6',
          'm', 'p', '4', '1'
        };

    assertThat(AudioSniffer.detect(head)).contains(AudioFormat.M4A);
  }

  @Test
  void anOggThatIsNeitherVorbisNorOpusIsRejected() {
    var theora =
        ("OggS" + "\0".repeat(24) + "\u0080theora")
            .getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);

    assertThat(AudioSniffer.detect(theora)).isEmpty();
  }
}
