package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Reads every audio file under a real music folder. Skipped unless OSSM_AUDIO_DIR is set, so CI and
 * fresh clones never need (or contain) anyone's music. Read-only: it never writes to the folder.
 *
 * <pre>OSSM_AUDIO_DIR=H:\AUDIO ./gradlew test --tests '*AudioLibrarySmokeTest'</pre>
 */
@EnabledIfEnvironmentVariable(named = "OSSM_AUDIO_DIR", matches = ".+")
class AudioLibrarySmokeTest {

  private static final Set<String> AUDIO = Set.of("mp3");

  @Test
  void everyMp3InTheFolderIsReadable() throws IOException {
    var root = Path.of(System.getenv("OSSM_AUDIO_DIR"));
    final java.util.List<Path> files;
    try (var paths = Files.walk(root)) {
      files =
          paths
              .filter(Files::isRegularFile)
              .filter(p -> AUDIO.contains(extension(p)))
              .sorted()
              .collect(Collectors.toList());
    }
    var failures = new TreeMap<String, String>();
    int withCover = 0, withAlbum = 0, withTrack = 0, withArtist = 0;
    for (var file : files) {
      try {
        var parsed = TagReader.read(file);
        withCover += parsed.cover() != null ? 1 : 0;
        withAlbum += parsed.album() != null ? 1 : 0;
        withTrack += parsed.trackNumber() != null ? 1 : 0;
        withArtist += parsed.artist() != null ? 1 : 0;
        assertThat(parsed.durationMs()).isPositive();
      } catch (TagReader.UnreadableAudioException e) {
        failures.put(file.getFileName().toString(), String.valueOf(e.getCause()));
      }
    }
    System.out.printf(
        "SAMPLE mp3 files=%d readable=%d artist=%d album=%d track=%d cover=%d%n",
        files.size(), files.size() - failures.size(), withArtist, withAlbum, withTrack, withCover);
    failures.forEach(
        (name, why) -> System.out.println("SAMPLE unreadable: " + name + " -> " + why));
    assertThat(failures).as("unreadable files").isEmpty();
  }

  private static String extension(Path file) {
    var name = file.getFileName().toString();
    var dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }
}
