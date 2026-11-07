package dev.ossm.api.video;

import java.nio.charset.StandardCharsets;

/**
 * A {@code Content-Disposition: attachment} value that saves a file under its original name,
 * whatever that name contains (RFC 6266). It carries two spellings: a plain {@code filename} for
 * old clients, with anything but safe ASCII replaced by an underscore, and {@code filename*} with
 * the exact name as percent-encoded UTF-8 (RFC 5987), which every current browser prefers.
 */
final class ContentDispositions {

  private static final String FALLBACK_NAME = "video";

  private ContentDispositions() {}

  static String attachment(String filename) {
    var name = withoutControlCharacters(filename);
    if (name.isBlank()) {
      name = FALLBACK_NAME;
    }
    return "attachment; filename=\"" + asciiFallback(name) + "\"; filename*=UTF-8''" + encode(name);
  }

  /** A line break in a file name would otherwise end the header and start another one. */
  private static String withoutControlCharacters(String name) {
    return name.codePoints()
        .filter(c -> c >= 0x20 && c != 0x7F)
        .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
        .toString();
  }

  private static String asciiFallback(String name) {
    var out = new StringBuilder();
    name.codePoints()
        .forEach(
            c -> {
              boolean safe = c >= 0x20 && c < 0x7F && c != '"' && c != '\\' && c != '%';
              out.append(safe ? (char) c : '_');
            });
    return out.toString();
  }

  /**
   * RFC 5987 {@code attr-char} stay as they are; every other byte of the UTF-8 form becomes %XX.
   */
  private static String encode(String name) {
    var out = new StringBuilder();
    for (byte b : name.getBytes(StandardCharsets.UTF_8)) {
      int c = b & 0xFF;
      if (isAttrChar(c)) {
        out.append((char) c);
      } else {
        out.append('%').append(Character.toUpperCase(Character.forDigit(c >> 4, 16)));
        out.append(Character.toUpperCase(Character.forDigit(c & 0xF, 16)));
      }
    }
    return out.toString();
  }

  private static boolean isAttrChar(int c) {
    return (c >= 'a' && c <= 'z')
        || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9')
        || "!#$&+-.^_`|~".indexOf(c) >= 0;
  }
}
