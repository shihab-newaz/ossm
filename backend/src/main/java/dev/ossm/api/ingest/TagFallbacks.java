package dev.ossm.api.ingest;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * What a track is called when its file has no usable tags, and how names are matched. Pure rules,
 * kept apart from ingest so they can be tested without a database or a store.
 */
final class TagFallbacks {

  static final String UNKNOWN_ARTIST = "Unknown Artist";
  private static final String UNTITLED = "Untitled";
  private static final Pattern WHITESPACE = Pattern.compile("\\s+");

  private TagFallbacks() {}

  /** The tag title, or the file name without folders or extension. */
  static String title(String tagTitle, String filename) {
    if (tagTitle != null && !tagTitle.isBlank()) {
      return tagTitle.strip();
    }
    var name =
        filename.substring(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
    var dot = name.lastIndexOf('.');
    var stem = (dot > 0 ? name.substring(0, dot) : name).strip();
    return stem.isEmpty() || stem.equals(".") ? UNTITLED : stem;
  }

  static String artist(String tagArtist) {
    return tagArtist == null || tagArtist.isBlank() ? UNKNOWN_ARTIST : tagArtist.strip();
  }

  /** Names match regardless of case and spacing: "Daft Punk" and " daft punk" are one artist. */
  static String key(String name) {
    return WHITESPACE.matcher(name.strip()).replaceAll(" ").toLowerCase(Locale.ROOT);
  }
}
