package dev.ossm.api.video;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Subtitle text helpers: SRT to WebVTT, and language tags to names people read. */
public final class Subtitles {

  private static final Pattern SRT_TIME = Pattern.compile("(\\d{1,2}:\\d{2}:\\d{2}),(\\d{3})");
  private static final Pattern LANGUAGE_IN_NAME =
      Pattern.compile("(?i)[._ -]([a-z]{2,3})(?:[._ -](?:forced|sdh|cc))?\\.(?:srt|vtt)$");
  private static final Map<String, String> ISO3_TO_ISO2 =
      Arrays.stream(Locale.getISOLanguages())
          .collect(
              Collectors.toMap(
                  code -> Locale.of(code).getISO3Language(), Function.identity(), (a, b) -> a));

  private Subtitles() {}

  /**
   * WebVTT from SRT (or from WebVTT, which is passed through). Handles a byte-order mark, Windows
   * line endings and comma decimals in cue times.
   */
  public static String toVtt(String text) {
    var body = text.startsWith("﻿") ? text.substring(1) : text;
    body = body.replace("\r\n", "\n").replace('\r', '\n').strip();
    if (body.startsWith("WEBVTT")) {
      return body + "\n";
    }
    return "WEBVTT\n\n" + SRT_TIME.matcher(body).replaceAll("$1.$2") + "\n";
  }

  /** "en" for "eng" or "EN"; null for something that is not a language. */
  public static String normalizeLanguage(String tag) {
    if (tag == null || tag.isBlank() || tag.equalsIgnoreCase("und")) {
      return null;
    }
    var lower = tag.strip().toLowerCase(Locale.ROOT);
    if (lower.length() == 2 && Arrays.asList(Locale.getISOLanguages()).contains(lower)) {
      return lower;
    }
    return lower.length() == 3 ? ISO3_TO_ISO2.get(lower) : null;
  }

  /** What the subtitles menu shows: "English", or the title when the language is unknown. */
  public static String label(String language, String title, int index) {
    if (language != null) {
      var name = Locale.of(language).getDisplayLanguage(Locale.ENGLISH);
      if (!name.isBlank() && !name.equalsIgnoreCase(language)) {
        return title == null || title.isBlank() || title.equalsIgnoreCase(name)
            ? name
            : name + " (" + title + ")";
      }
    }
    return title == null || title.isBlank() ? "Subtitles " + (index + 1) : title;
  }

  /** The language a sidecar file names itself with: "Movie.en.srt" is English. */
  public static Optional<String> languageFromFilename(String filename) {
    var m = LANGUAGE_IN_NAME.matcher(filename);
    return m.find() ? Optional.ofNullable(normalizeLanguage(m.group(1))) : Optional.empty();
  }
}
