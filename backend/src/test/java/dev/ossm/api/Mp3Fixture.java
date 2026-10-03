package dev.ossm.api;

import java.io.IOException;
import java.nio.file.Files;
import java.util.Base64;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.images.ArtworkFactory;

/** Builds tiny but real MP3 files: valid MPEG frames (silence) with ID3 tags and optional cover. */
final class Mp3Fixture {

  /** A 1x1 PNG, the cover art. */
  static final byte[] PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

  /** MPEG-1 Layer III, 128 kbps, 44.1 kHz: 417-byte frames of about 26 ms each. */
  private static final int FRAME_BYTES = 417;

  static {
    Logger.getLogger("org.jaudiotagger").setLevel(Level.OFF);
  }

  private Mp3Fixture() {}

  record Tags(
      String title,
      String artist,
      String album,
      String albumArtist,
      Integer track,
      Integer year,
      boolean cover) {

    static Tags none() {
      return new Tags(null, null, null, null, null, null, false);
    }
  }

  /** About 5 seconds of audio. */
  static byte[] mp3(Tags tags) throws IOException {
    return mp3(tags, 200);
  }

  static byte[] mp3(Tags tags, int frames) throws IOException {
    var file = Files.createTempFile("fixture", ".mp3");
    try {
      var frame = new byte[FRAME_BYTES];
      frame[0] = (byte) 0xFF;
      frame[1] = (byte) 0xFB;
      frame[2] = (byte) 0x90;
      frame[3] = 0x00;
      try (var out = Files.newOutputStream(file)) {
        for (int i = 0; i < frames; i++) {
          out.write(frame);
        }
      }
      var hasTags =
          tags.title() != null
              || tags.artist() != null
              || tags.album() != null
              || tags.cover()
              || tags.track() != null
              || tags.year() != null;
      if (hasTags) {
        var audio = AudioFileIO.read(file.toFile());
        var tag = audio.getTagOrCreateAndSetDefault();
        set(tag, FieldKey.TITLE, tags.title());
        set(tag, FieldKey.ARTIST, tags.artist());
        set(tag, FieldKey.ALBUM, tags.album());
        set(tag, FieldKey.ALBUM_ARTIST, tags.albumArtist());
        set(tag, FieldKey.TRACK, tags.track() == null ? null : String.valueOf(tags.track()));
        set(tag, FieldKey.TRACK_TOTAL, tags.track() == null ? null : "12");
        set(tag, FieldKey.YEAR, tags.year() == null ? null : String.valueOf(tags.year()));
        if (tags.cover()) {
          var art = ArtworkFactory.getNew();
          art.setBinaryData(PNG);
          art.setMimeType("image/png");
          art.setPictureType(3);
          tag.setField(art);
        }
        audio.commit();
      }
      return Files.readAllBytes(file);
    } catch (Exception e) {
      throw new IllegalStateException("Could not build the MP3 fixture", e);
    } finally {
      Files.deleteIfExists(file);
    }
  }

  private static void set(org.jaudiotagger.tag.Tag tag, FieldKey key, String value)
      throws Exception {
    if (value != null) {
      tag.setField(key, value);
    }
  }
}
