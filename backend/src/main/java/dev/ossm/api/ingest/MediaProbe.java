package dev.ossm.api.ingest;

import java.util.List;

/**
 * Reads a video over HTTP (ADR 0010): what is in it, one frame, its text subtitles. The adapter
 * runs ffprobe and ffmpeg; nothing here ever transcodes the video itself.
 */
interface MediaProbe {

  record Stream(
      int index,
      String type,
      String codec,
      Integer width,
      Integer height,
      String language,
      String title,
      boolean attachedPicture) {}

  record Probe(String formatName, long durationMs, Integer bitrateKbps, List<Stream> streams) {}

  /** Containers and streams. */
  Probe probe(String url) throws MediaException;

  /** One frame as JPEG, scaled to 640 px wide. */
  byte[] frame(String url, double atSeconds) throws MediaException;

  /** One text subtitle stream as WebVTT. */
  String subtitles(String url, int streamIndex) throws MediaException;

  /** The file could not be read: a terminal ingest failure with a reason people can read. */
  final class MediaException extends Exception {
    MediaException(String message) {
      super(message);
    }
  }
}
