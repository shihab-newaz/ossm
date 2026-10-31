package dev.ossm.api.ingest;

import java.util.regex.Pattern;

/**
 * What a video is, from its filename: {@code Show.Name.S01E02.Title.mkv} and {@code Show Name
 * 1x02.mp4} are episodes, {@code Movie Title (2019).mp4} is a movie of that year, anything else is
 * a movie titled after the file. Release junk ({@code 1080p}, {@code x264}, {@code WEB-DL}) is cut.
 * People can correct the result afterwards.
 */
final class VideoNames {

  record Parsed(
      String kind, String title, Integer year, String show, Integer season, Integer episode) {
    static Parsed movie(String title, Integer year) {
      return new Parsed("MOVIE", title, year, null, null, null);
    }
  }

  private static final Pattern EXTENSION = Pattern.compile("\\.[A-Za-z0-9]{2,4}$");
  private static final Pattern SXXEYY =
      Pattern.compile("(?i)^(.*?)[\\s-]*\\bS(\\d{1,2})[\\s.]?E(\\d{1,3})\\b(.*)$");
  private static final Pattern NXNN =
      Pattern.compile("(?i)^(.*?)[\\s-]*\\b(\\d{1,2})x(\\d{2,3})\\b(.*)$");
  private static final Pattern YEAR =
      Pattern.compile("^(.*?)[\\s(\\[-]*\\b((?:19|20)\\d{2})\\b[)\\]]?(.*)$");
  private static final Pattern JUNK =
      Pattern.compile(
          "(?i)\\b(2160p|1440p|1080p|720p|576p|480p|4k|uhd|hdr10?|dv|x26[45]|h\\.?26[45]|hevc|av1|"
              + "web-?dl|web-?rip|webrip|blu-?ray|brrip|bdrip|dvdrip|hdtv|remux|aac\\d?|ac3|eac3|dts|"
              + "ddp?5\\.1|proper|repack|extended|10bit|8bit)\\b.*$");

  private VideoNames() {}

  static Parsed parse(String filename) {
    var name = EXTENSION.matcher(filename.strip()).replaceFirst("");
    var spaced = name.replaceAll("[._]+", " ").replaceAll("\\s+", " ").strip();

    var episode = SXXEYY.matcher(spaced);
    if (!episode.matches()) {
      episode = NXNN.matcher(spaced);
    }
    if (episode.matches() && !clean(episode.group(1)).isEmpty()) {
      int season = Integer.parseInt(episode.group(2));
      int number = Integer.parseInt(episode.group(3));
      var title = clean(episode.group(4));
      return new Parsed(
          "EPISODE",
          title.isEmpty() ? "Episode " + number : title,
          null,
          clean(episode.group(1)),
          season,
          number);
    }

    var year = YEAR.matcher(spaced);
    if (year.matches() && !clean(year.group(1)).isEmpty()) {
      return Parsed.movie(clean(year.group(1)), Integer.parseInt(year.group(2)));
    }
    var title = clean(spaced);
    return Parsed.movie(title.isEmpty() ? name.strip() : title, null);
  }

  /** Drops release junk and stray separators from either end. */
  private static String clean(String part) {
    var cut = JUNK.matcher(part).replaceFirst("");
    return cut.replaceAll("^[\\s\\-:()\\[\\]]+|[\\s\\-:()\\[\\]]+$", "").strip();
  }
}
