package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Runs every audio file under a real music folder through the same sniff-and-read path ingest uses.
 * Skipped unless OSSM_AUDIO_DIR is set, so CI and fresh clones never need (or contain) anyone's
 * music. Read-only: files are copied to a temp directory and never modified.
 *
 * <pre>OSSM_AUDIO_DIR=H:\AUDIO ./gradlew test --tests '*AudioLibrarySmokeTest'</pre>
 */
@EnabledIfEnvironmentVariable(named = "OSSM_AUDIO_DIR", matches = ".+")
class AudioLibrarySmokeTest {

  private static final Set<String> CANDIDATES =
      Set.of("mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "weba", "webm", "wma");

  @Test
  void everySupportedFileInTheFolderIsReadable() throws IOException {
    var root = Path.of(System.getenv("OSSM_AUDIO_DIR"));
    final List<Path> files;
    try (var paths = Files.walk(root)) {
      files =
          paths
              .filter(Files::isRegularFile)
              .filter(p -> CANDIDATES.contains(extension(p)))
              .sorted()
              .collect(Collectors.toList());
    }
    var temp = Files.createTempDirectory("ossm-smoke");
    var readable = new TreeMap<String, Integer>();
    var rejected = new TreeMap<String, Integer>();
    var failures = new TreeMap<String, String>();
    int copies = 0;
    int withBitrate = 0;
    int withCover = 0, withAlbum = 0, withTrack = 0, withArtist = 0, withColor = 0;
    try {
      for (var file : files) {
        var ext = extension(file);
        var format = AudioSniffer.detect(file);
        if (format.isEmpty()) {
          // Not a supported format (for example WebM audio): ingest rejects it with a reason.
          rejected.merge(ext, 1, Integer::sum);
          continue;
        }
        var named =
            Files.copy(
                file,
                // Unique names: Windows keeps the previous copy locked for a moment.
                temp.resolve("audio-" + copies++ + format.get().extension()));
        try {
          var parsed = TagReader.read(named);
          assertThat(parsed.durationMs()).isPositive();
          readable.merge(
              ext + "->" + format.get().name().toLowerCase(Locale.ROOT), 1, Integer::sum);
          withCover += parsed.cover() != null ? 1 : 0;
          withColor +=
              parsed.cover() != null && DominantColor.of(parsed.cover().bytes()).isPresent()
                  ? 1
                  : 0;
          withBitrate += parsed.bitrateKbps() != null ? 1 : 0;
          withAlbum += parsed.album() != null ? 1 : 0;
          withTrack += parsed.trackNumber() != null ? 1 : 0;
          withArtist += parsed.artist() != null ? 1 : 0;
        } catch (TagReader.UnreadableAudioException e) {
          failures.put(file.getFileName().toString(), String.valueOf(e.getCause()));
        }
      }
    } finally {
      try (var leftovers = Files.walk(temp)) {
        leftovers.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
      }
    }
    int ok = readable.values().stream().mapToInt(Integer::intValue).sum();
    System.out.printf(
        "SAMPLE files=%d readable=%d %s rejected=%s unreadable=%d bitrate=%d artist=%d album=%d track=%d cover=%d color=%d%n",
        files.size(),
        ok,
        readable,
        rejected,
        failures.size(),
        withBitrate,
        withArtist,
        withAlbum,
        withTrack,
        withCover,
        withColor);
    failures.forEach(
        (name, why) -> System.out.println("SAMPLE unreadable: " + name + " -> " + why));
    assertThat(failures).as("supported files that could not be read").isEmpty();
  }

  private static String extension(Path file) {
    var name = file.getFileName().toString();
    var dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }
}
