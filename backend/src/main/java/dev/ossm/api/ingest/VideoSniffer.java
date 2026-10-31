package dev.ossm.api.ingest;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Which video container a file is, from its first bytes, never its name (spec 03). ISO BMFF (MP4,
 * M4V, MOV) starts with an {@code ftyp} box; Matroska and WebM start with an EBML header whose
 * DocType says which of the two it is.
 */
final class VideoSniffer {

  enum Container {
    MP4("mp4"),
    MOV("mov"),
    WEBM("webm"),
    MKV("mkv");

    final String extension;

    Container(String extension) {
      this.extension = extension;
    }
  }

  private VideoSniffer() {}

  static Optional<Container> detect(byte[] head) {
    if (head.length >= 12 && ascii(head, 4, 8).equals("ftyp")) {
      return Optional.of(ascii(head, 8, 12).equals("qt  ") ? Container.MOV : Container.MP4);
    }
    if (head.length >= 4
        && (head[0] & 0xFF) == 0x1A
        && (head[1] & 0xFF) == 0x45
        && (head[2] & 0xFF) == 0xDF
        && (head[3] & 0xFF) == 0xA3) {
      return Optional.of("webm".equals(docType(head)) ? Container.WEBM : Container.MKV);
    }
    return Optional.empty();
  }

  /** The EBML DocType element (ID 0x4282): "webm" or "matroska". */
  private static String docType(byte[] head) {
    for (int i = 4; i + 3 < Math.min(head.length, 128); i++) {
      if ((head[i] & 0xFF) == 0x42 && (head[i + 1] & 0xFF) == 0x82) {
        int sizeByte = head[i + 2] & 0xFF;
        // A one-byte EBML size: the top bit is the marker, the rest is the length.
        if ((sizeByte & 0x80) != 0) {
          int length = sizeByte & 0x7F;
          if (i + 3 + length <= head.length) {
            return ascii(head, i + 3, i + 3 + length);
          }
        }
        return null;
      }
    }
    return null;
  }

  private static String ascii(byte[] bytes, int from, int to) {
    return new String(bytes, from, to - from, StandardCharsets.ISO_8859_1);
  }
}
