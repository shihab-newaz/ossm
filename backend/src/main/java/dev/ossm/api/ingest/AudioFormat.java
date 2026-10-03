package dev.ossm.api.ingest;

/**
 * The audio formats OSSM accepts. The extension is what the tag parser keys on, so it must be
 * right.
 */
enum AudioFormat {
  MP3(".mp3"),
  FLAC(".flac"),
  M4A(".m4a"),
  OGG(".ogg"),
  // jaudiotagger has no reader for the .opus extension but parses Opus inside an Ogg container.
  OPUS(".ogg"),
  WAV(".wav");

  private final String extension;

  AudioFormat(String extension) {
    this.extension = extension;
  }

  String extension() {
    return extension;
  }
}
