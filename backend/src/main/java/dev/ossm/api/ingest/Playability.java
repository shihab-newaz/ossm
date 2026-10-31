package dev.ossm.api.ingest;

import dev.ossm.api.ingest.VideoSniffer.Container;
import java.util.Locale;
import java.util.Set;

/**
 * Whether a browser can play a file as stored (there is no transcoding). A file that fails this is
 * still kept and still tried, with a "may not play in this browser" badge. The rule is spec 03's;
 * ticket 19's browser check may tighten it.
 */
final class Playability {

  private static final Set<String> MP4_VIDEO = Set.of("h264", "hevc", "av1");
  private static final Set<String> MP4_AUDIO = Set.of("aac", "mp3", "opus", "flac");
  private static final Set<String> WEBM_VIDEO = Set.of("vp8", "vp9", "av1");
  private static final Set<String> WEBM_AUDIO = Set.of("vorbis", "opus");

  private Playability() {}

  /** A null audio codec means a silent video, which is fine. */
  static boolean playable(Container container, String videoCodec, String audioCodec) {
    var video = videoCodec == null ? "" : videoCodec.toLowerCase(Locale.ROOT);
    var audio = audioCodec == null ? null : audioCodec.toLowerCase(Locale.ROOT);
    return switch (container) {
      case MP4, MOV -> MP4_VIDEO.contains(video) && (audio == null || MP4_AUDIO.contains(audio));
      case WEBM -> WEBM_VIDEO.contains(video) && (audio == null || WEBM_AUDIO.contains(audio));
      case MKV -> false;
    };
  }
}
