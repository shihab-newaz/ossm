package dev.ossm.api;

import java.nio.charset.StandardCharsets;
import java.util.Random;

/**
 * Tiny stand-ins for video files: a real container header followed by a few KB of seeded filler.
 * The server only reads the header and hashes the rest, so nothing here needs to play, and no
 * ffmpeg is involved. Different seeds are different files.
 */
final class VideoFixture {

  private static final int PAYLOAD = 4096;

  private VideoFixture() {}

  static byte[] mp4(long seed) {
    var head = new byte[24];
    head[3] = 24;
    ascii(head, 4, "ftyp");
    ascii(head, 8, "isom");
    ascii(head, 16, "isom");
    ascii(head, 20, "mp41");
    return withPayload(head, seed);
  }

  static byte[] webm(long seed) {
    var type = "webm".getBytes(StandardCharsets.US_ASCII);
    var head = new byte[11 + type.length];
    head[0] = 0x1A;
    head[1] = 0x45;
    head[2] = (byte) 0xDF;
    head[3] = (byte) 0xA3;
    head[4] = (byte) 0x9F;
    head[8] = 0x42;
    head[9] = (byte) 0x82;
    head[10] = (byte) (0x80 | type.length);
    System.arraycopy(type, 0, head, 11, type.length);
    return withPayload(head, seed);
  }

  /** Bytes with a video extension that are not a video at all. */
  static byte[] notAVideo() {
    return "this is a text file, not a video".repeat(40).getBytes(StandardCharsets.US_ASCII);
  }

  private static byte[] withPayload(byte[] head, long seed) {
    var file = new byte[head.length + PAYLOAD];
    System.arraycopy(head, 0, file, 0, head.length);
    var filler = new byte[PAYLOAD];
    new Random(seed).nextBytes(filler);
    System.arraycopy(filler, 0, file, head.length, PAYLOAD);
    return file;
  }

  private static void ascii(byte[] into, int at, String text) {
    System.arraycopy(text.getBytes(StandardCharsets.US_ASCII), 0, into, at, text.length());
  }
}
