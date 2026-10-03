package dev.ossm.api.ingest;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Optional;
import java.util.Set;

/**
 * Decides what a file is from its first bytes, never from its name. A text file called song.mp3 is
 * rejected, and a FLAC called song.mp3 is accepted as the FLAC it is.
 */
final class AudioSniffer {

  private static final int WINDOW = 4096;
  private static final Set<String> M4A_BRANDS =
      Set.of("M4A ", "M4B ", "M4P ", "mp41", "mp42", "isom", "iso2", "iso5", "iso6", "dash");

  private AudioSniffer() {}

  static Optional<AudioFormat> detect(Path file) throws IOException {
    try (var channel = FileChannel.open(file, StandardOpenOption.READ)) {
      var start = skipId3(channel);
      var head = read(channel, start, WINDOW);
      return detect(head);
    }
  }

  static Optional<AudioFormat> detect(byte[] head) {
    if (head.length >= 4 && ascii(head, 0, 4).equals("fLaC")) {
      return Optional.of(AudioFormat.FLAC);
    }
    if (head.length >= 4 && ascii(head, 0, 4).equals("OggS")) {
      var page = ascii(head, 0, Math.min(head.length, 512));
      if (page.contains("OpusHead")) {
        return Optional.of(AudioFormat.OPUS);
      }
      return page.contains("\u0001vorbis") ? Optional.of(AudioFormat.OGG) : Optional.empty();
    }
    if (head.length >= 12
        && ascii(head, 0, 4).equals("RIFF")
        && ascii(head, 8, 12).equals("WAVE")) {
      return Optional.of(AudioFormat.WAV);
    }
    if (head.length >= 12 && ascii(head, 4, 8).equals("ftyp")) {
      return isMp4Audio(head) ? Optional.of(AudioFormat.M4A) : Optional.empty();
    }
    return hasMpegAudioFrame(head) ? Optional.of(AudioFormat.MP3) : Optional.empty();
  }

  /** An ID3v2 tag may sit in front of any format; the audio starts after it. */
  private static long skipId3(FileChannel channel) throws IOException {
    var header = read(channel, 0, 10);
    if (header.length < 10 || !ascii(header, 0, 3).equals("ID3")) {
      return 0;
    }
    long size =
        ((header[6] & 0x7F) << 21)
            | ((header[7] & 0x7F) << 14)
            | ((header[8] & 0x7F) << 7)
            | (header[9] & 0x7F);
    var footer = (header[5] & 0x10) != 0 ? 10 : 0;
    return 10 + size + footer;
  }

  /**
   * MP4 family: the major brand or any compatible brand must be an audio/generic one, not video.
   */
  private static boolean isMp4Audio(byte[] head) {
    var boxSize = Math.min(head.length, (int) Math.min(readInt(head, 0), 256));
    if (M4A_BRANDS.contains(ascii(head, 8, 12))) {
      return true;
    }
    for (int i = 16; i + 4 <= boxSize; i += 4) {
      if (ascii(head, i, i + 4).equals("M4A ") || ascii(head, i, i + 4).equals("M4B ")) {
        return true;
      }
    }
    return false;
  }

  private static long readInt(byte[] b, int at) {
    return ((b[at] & 0xFFL) << 24)
        | ((b[at + 1] & 0xFF) << 16)
        | ((b[at + 2] & 0xFF) << 8)
        | (b[at + 3] & 0xFF);
  }

  private static final int[][] BITRATES = {
    // MPEG-1 layer I, II, III; MPEG-2/2.5 layer I, II+III (kbps, index 0 = free format,
    // unsupported)
    {0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448},
    {0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384},
    {0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320},
    {0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256},
    {0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}
  };
  private static final int[][] SAMPLE_RATES = {
    {44100, 48000, 32000}, {22050, 24000, 16000}, {11025, 12000, 8000}
  };

  /**
   * Finds an MPEG audio frame near the start and checks that a second, consistent frame follows
   * exactly where the first one says it ends. A lone matching byte pair in a WebM or image file is
   * not enough. Raw ADTS AAC shares the sync bits but has layer 00, so it never matches.
   */
  private static boolean hasMpegAudioFrame(byte[] head) {
    for (int i = 0; i + 4 <= head.length; i++) {
      var length = frameLength(head, i);
      if (length <= 0) {
        continue;
      }
      var next = i + length;
      if (next + 4 <= head.length
          && frameLength(head, next) > 0
          && (head[next + 1] & 0x1E) == (head[i + 1] & 0x1E)
          && (head[next + 2] & 0x0C) == (head[i + 2] & 0x0C)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Length in bytes of the MPEG audio frame whose header starts at {@code i}, or -1 if it is not
   * one.
   */
  private static int frameLength(byte[] b, int i) {
    if (i + 4 > b.length || (b[i] & 0xFF) != 0xFF || (b[i + 1] & 0xE0) != 0xE0) {
      return -1;
    }
    var versionBits = (b[i + 1] >> 3) & 0x3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    var layerBits = (b[i + 1] >> 1) & 0x3; // 3 = I, 2 = II, 1 = III
    var bitrateIndex = (b[i + 2] >> 4) & 0xF;
    var rateIndex = (b[i + 2] >> 2) & 0x3;
    var padding = (b[i + 2] >> 1) & 0x1;
    if (versionBits == 1
        || layerBits == 0
        || bitrateIndex == 0
        || bitrateIndex == 15
        || rateIndex == 3) {
      return -1;
    }
    var mpeg1 = versionBits == 3;
    var layer = 4 - layerBits; // 1, 2 or 3
    var table = mpeg1 ? layer - 1 : (layer == 1 ? 3 : 4);
    var bitrate = BITRATES[table][bitrateIndex] * 1000;
    var sampleRate = SAMPLE_RATES[mpeg1 ? 0 : versionBits == 2 ? 1 : 2][rateIndex];
    if (layer == 1) {
      return (12 * bitrate / sampleRate + padding) * 4;
    }
    var samplesFactor = (layer == 3 && !mpeg1) ? 72 : 144;
    return samplesFactor * bitrate / sampleRate + padding;
  }

  private static byte[] read(FileChannel channel, long position, int length) throws IOException {
    var buffer = ByteBuffer.allocate(length);
    while (buffer.hasRemaining()) {
      var n = channel.read(buffer, position + buffer.position());
      if (n < 0) {
        break;
      }
    }
    return java.util.Arrays.copyOf(buffer.array(), buffer.position());
  }

  private static String ascii(byte[] bytes, int from, int to) {
    return new String(bytes, from, to - from, StandardCharsets.ISO_8859_1);
  }
}
