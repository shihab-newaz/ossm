package dev.ossm.api.ingest;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Reads Opus-in-Ogg files. jaudiotagger parses Ogg Vorbis but not Opus, so this does the little
 * that is needed: the OpusHead and OpusTags packets at the start (tags and cover art) and the last
 * Ogg page's granule position (duration). Anything malformed is an {@link IOException}.
 */
final class OpusReader {

  /** Opus always counts granule positions at 48 kHz, whatever the original sample rate. */
  private static final double GRANULE_RATE = 48_000.0;

  private static final long MAX_HEADER_BYTES = 32L * 1024 * 1024;
  private static final int TAIL_BYTES = 128 * 1024;

  private OpusReader() {}

  static TagReader.Parsed read(Path file) throws IOException {
    var size = Files.size(file);
    try (var in = new RandomAccessFile(file.toFile(), "r")) {
      var packets = headerPackets(in);
      var head = packets[0];
      if (head.length < 19 || !ascii(head, 0, 8).equals("OpusHead")) {
        throw new IOException("Not an Opus stream");
      }
      var preSkip = ByteBuffer.wrap(head, 10, 2).order(ByteOrder.LITTLE_ENDIAN).getShort() & 0xFFFF;
      var tags = comments(packets[1]);

      var granule = lastGranule(in, size);
      if (granule <= preSkip) {
        throw new IOException("No audio in this Opus file");
      }
      var seconds = (granule - preSkip) / GRANULE_RATE;
      var durationMs = Math.round(seconds * 1000);
      var bitrate = (int) Math.round(size * 8 / seconds / 1000);

      return new TagReader.Parsed(
          tags.get("TITLE"),
          tags.get("ARTIST"),
          tags.get("ALBUMARTIST"),
          tags.get("ALBUM"),
          TagReader.leadingNumber(tags.get("TRACKNUMBER")),
          TagReader.leadingNumber(tags.get("DISCNUMBER")),
          TagReader.year(tags.get("DATE")),
          tags.get("GENRE"),
          durationMs,
          "opus",
          TagReader.effectiveBitrate(bitrate > 0 ? bitrate : null, size, durationMs),
          cover(tags.get("METADATA_BLOCK_PICTURE")));
    }
  }

  /** The first two packets (identification and comments), reassembled across Ogg pages. */
  private static byte[][] headerPackets(RandomAccessFile in) throws IOException {
    var packets = new byte[2][];
    var current = new ByteArrayOutputStream();
    var found = 0;
    long total = 0;
    in.seek(0);
    while (found < 2) {
      var header = new byte[27];
      in.readFully(header);
      if (!ascii(header, 0, 4).equals("OggS")) {
        throw new IOException("Not an Ogg stream");
      }
      var segments = header[26] & 0xFF;
      var lacing = new byte[segments];
      in.readFully(lacing);
      for (var lace : lacing) {
        var length = lace & 0xFF;
        total += length;
        if (total > MAX_HEADER_BYTES) {
          throw new IOException("Opus headers are implausibly large");
        }
        var chunk = new byte[length];
        in.readFully(chunk);
        current.write(chunk);
        if (length < 255) {
          packets[found++] = current.toByteArray();
          current.reset();
          if (found == 2) {
            break;
          }
        }
      }
    }
    return packets;
  }

  /**
   * Vorbis-comment layout: vendor string, then count and "KEY=value" entries, all little-endian.
   */
  private static Map<String, String> comments(byte[] packet) throws IOException {
    if (packet.length < 16 || !ascii(packet, 0, 8).equals("OpusTags")) {
      throw new IOException("Missing OpusTags");
    }
    var buffer = ByteBuffer.wrap(packet).order(ByteOrder.LITTLE_ENDIAN);
    buffer.position(8);
    skip(buffer, buffer.getInt());
    var count = buffer.getInt();
    var result = new HashMap<String, String>();
    for (int i = 0; i < count && buffer.remaining() >= 4; i++) {
      var length = buffer.getInt();
      if (length < 0 || length > buffer.remaining()) {
        break;
      }
      var bytes = new byte[length];
      buffer.get(bytes);
      var entry = new String(bytes, StandardCharsets.UTF_8);
      var equals = entry.indexOf('=');
      if (equals > 0) {
        var value = entry.substring(equals + 1).strip();
        if (!value.isEmpty()) {
          result.putIfAbsent(entry.substring(0, equals).toUpperCase(Locale.ROOT), value);
        }
      }
    }
    return result;
  }

  private static void skip(ByteBuffer buffer, int length) throws IOException {
    if (length < 0 || length > buffer.remaining()) {
      throw new IOException("Corrupt OpusTags");
    }
    buffer.position(buffer.position() + length);
  }

  /** The granule position of the last Ogg page in the file: total samples at 48 kHz. */
  private static long lastGranule(RandomAccessFile in, long size) throws IOException {
    var length = (int) Math.min(size, TAIL_BYTES);
    var tail = new byte[length];
    in.seek(size - length);
    in.readFully(tail);
    for (int i = length - 27; i >= 0; i--) {
      if (tail[i] == 'O'
          && tail[i + 1] == 'g'
          && tail[i + 2] == 'g'
          && tail[i + 3] == 'S'
          && tail[i + 4] == 0) {
        return ByteBuffer.wrap(tail, i + 6, 8).order(ByteOrder.LITTLE_ENDIAN).getLong();
      }
    }
    throw new IOException("No Ogg page at the end of the file");
  }

  /** METADATA_BLOCK_PICTURE is a base64 FLAC picture block: type, mime, description, size, data. */
  private static TagReader.Cover cover(String base64) {
    if (base64 == null) {
      return null;
    }
    try {
      var buffer = ByteBuffer.wrap(Base64.getMimeDecoder().decode(base64));
      buffer.getInt(); // picture type
      var mime = string(buffer, buffer.getInt());
      string(buffer, buffer.getInt()); // description
      buffer.position(buffer.position() + 16); // width, height, depth, colours
      var data = new byte[buffer.getInt()];
      buffer.get(data);
      return data.length == 0
          ? null
          : new TagReader.Cover(data, mime.isBlank() ? "image/jpeg" : mime);
    } catch (RuntimeException e) {
      return null;
    }
  }

  private static String string(ByteBuffer buffer, int length) {
    var bytes = new byte[length];
    buffer.get(bytes);
    return new String(bytes, StandardCharsets.UTF_8);
  }

  private static String ascii(byte[] bytes, int from, int to) {
    return new String(bytes, from, to - from, StandardCharsets.ISO_8859_1);
  }
}
