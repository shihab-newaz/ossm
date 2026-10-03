package dev.ossm.api.ingest;

import java.nio.file.Path;
import java.util.Locale;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;

/** Reads tags, technical properties and embedded cover art on the JVM. No ffmpeg. */
final class TagReader {

  static {
    // jaudiotagger logs every field it meets at INFO.
    Logger.getLogger("org.jaudiotagger").setLevel(Level.WARNING);
  }

  private TagReader() {}

  record Cover(byte[] bytes, String mimeType) {}

  record Parsed(
      String title,
      String artist,
      String albumArtist,
      String album,
      Integer trackNumber,
      Integer discNumber,
      Integer year,
      String genre,
      long durationMs,
      String codec,
      Integer bitrateKbps,
      Cover cover) {}

  /** The file is not something we can read as audio. The message is safe to show to the user. */
  static final class UnreadableAudioException extends Exception {
    UnreadableAudioException(String message, Throwable cause) {
      super(message, cause);
    }
  }

  /** The file's extension picks the parser, so it must carry the right one. */
  static Parsed read(Path file) throws UnreadableAudioException {
    final AudioFile audio;
    try {
      audio = AudioFileIO.read(file.toFile());
    } catch (Exception e) {
      throw new UnreadableAudioException("This file could not be read as audio.", e);
    }
    var header = audio.getAudioHeader();
    if (header == null) {
      throw new UnreadableAudioException("This file has no readable audio.", null);
    }
    var tag = audio.getTag();
    var durationMs = Math.round(header.getPreciseTrackLength() * 1000);
    if (durationMs <= 0) {
      throw new UnreadableAudioException("This file has no audio in it.", null);
    }
    return new Parsed(
        text(tag, FieldKey.TITLE),
        text(tag, FieldKey.ARTIST),
        text(tag, FieldKey.ALBUM_ARTIST),
        text(tag, FieldKey.ALBUM),
        leadingNumber(text(tag, FieldKey.TRACK)),
        leadingNumber(text(tag, FieldKey.DISC_NO)),
        year(text(tag, FieldKey.YEAR)),
        text(tag, FieldKey.GENRE),
        durationMs,
        codecName(header.getEncodingType()),
        header.getBitRateAsNumber() > 0 ? (int) header.getBitRateAsNumber() : null,
        cover(tag));
  }

  /** jaudiotagger names codecs like "mpeg-1 layer 3"; the app wants short, stable names. */
  static String codecName(String encodingType) {
    if (encodingType == null || encodingType.isBlank()) {
      return null;
    }
    var name = encodingType.strip().toLowerCase(Locale.ROOT);
    if (name.contains("layer 3") || name.equals("mp3")) {
      return "mp3";
    }
    if (name.contains("flac")) {
      return "flac";
    }
    if (name.contains("alac") || name.contains("apple lossless")) {
      return "alac";
    }
    if (name.contains("aac")) {
      return "aac";
    }
    if (name.contains("opus")) {
      return "opus";
    }
    if (name.contains("vorbis")) {
      return "vorbis";
    }
    if (name.contains("pcm") || name.contains("wav")) {
      return "wav";
    }
    return name;
  }

  private static String text(Tag tag, FieldKey key) {
    if (tag == null) {
      return null;
    }
    try {
      var value = tag.getFirst(key);
      return value == null || value.isBlank() ? null : value.strip();
    } catch (RuntimeException e) {
      return null;
    }
  }

  /** "3" and "3/12" both mean track 3. */
  static Integer leadingNumber(String value) {
    if (value == null) {
      return null;
    }
    var digits = new StringBuilder();
    for (char c : value.strip().toCharArray()) {
      if (!Character.isDigit(c)) {
        break;
      }
      digits.append(c);
    }
    if (digits.isEmpty() || digits.length() > 6) {
      return null;
    }
    var n = Integer.parseInt(digits.toString());
    return n > 0 ? n : null;
  }

  /** Tags carry "2013", "2013-05-01" and worse; the year is the leading four digits. */
  static Integer year(String value) {
    if (value == null || value.length() < 4) {
      return null;
    }
    var head = value.substring(0, 4);
    return head.chars().allMatch(Character::isDigit) ? Integer.valueOf(head) : null;
  }

  private static Cover cover(Tag tag) {
    if (tag == null) {
      return null;
    }
    try {
      Artwork art = tag.getFirstArtwork();
      if (art == null || art.getBinaryData() == null || art.getBinaryData().length == 0) {
        return null;
      }
      var mime = art.getMimeType() == null ? "image/jpeg" : art.getMimeType();
      return new Cover(art.getBinaryData(), mime);
    } catch (RuntimeException e) {
      return null;
    }
  }
}
