package dev.ossm.api.ingest;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The ffprobe/ffmpeg adapter. Each call is a child process with a timeout and a cap on what it may
 * print, reading the object from a short-lived internal URL so only the ranges it needs are read.
 */
@Component
@EnableConfigurationProperties(FfmpegMediaProbe.MediaProperties.class)
class FfmpegMediaProbe implements MediaProbe {

  /** Where the binaries are and how long one call may take. */
  @ConfigurationProperties("ossm.media")
  record MediaProperties(String ffprobe, String ffmpeg, Duration timeout) {
    MediaProperties {
      ffprobe = ffprobe == null || ffprobe.isBlank() ? "ffprobe" : ffprobe;
      ffmpeg = ffmpeg == null || ffmpeg.isBlank() ? "ffmpeg" : ffmpeg;
      timeout = timeout == null ? Duration.ofMinutes(2) : timeout;
    }
  }

  private static final Logger log = LoggerFactory.getLogger(FfmpegMediaProbe.class);
  private static final int MAX_PROBE_BYTES = 4 * 1024 * 1024;
  private static final int MAX_FRAME_BYTES = 8 * 1024 * 1024;
  private static final int MAX_SUBTITLE_BYTES = 8 * 1024 * 1024;

  private final MediaProperties properties;
  private final ObjectMapper json = new ObjectMapper();

  FfmpegMediaProbe(MediaProperties properties) {
    this.properties = properties;
  }

  @Override
  public Probe probe(String url) throws MediaException {
    var out =
        run(
            List.of(
                properties.ffprobe(),
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_entries",
                "stream=index,codec_type,codec_name,width,height:stream_tags=language,title"
                    + ":stream_disposition=attached_pic:format=format_name,duration,bit_rate",
                url),
            MAX_PROBE_BYTES,
            "read this video");
    final JsonNode root;
    try {
      root = json.readTree(new String(out, StandardCharsets.UTF_8));
    } catch (RuntimeException e) {
      throw new MediaException("We couldn't read this video's details.");
    }
    var format = root.path("format");
    var streams = new ArrayList<Stream>();
    for (var s : root.path("streams")) {
      streams.add(
          new Stream(
              s.path("index").asInt(),
              text(s, "codec_type"),
              text(s, "codec_name"),
              s.hasNonNull("width") ? s.path("width").asInt() : null,
              s.hasNonNull("height") ? s.path("height").asInt() : null,
              text(s.path("tags"), "language"),
              text(s.path("tags"), "title"),
              s.path("disposition").path("attached_pic").asInt() == 1));
    }
    var duration = format.hasNonNull("duration") ? parseDouble(text(format, "duration")) : 0;
    var bitrate = format.hasNonNull("bit_rate") ? parseDouble(text(format, "bit_rate")) : 0;
    return new Probe(
        text(format, "format_name"),
        Math.round(duration * 1000),
        bitrate > 0 ? (int) Math.round(bitrate / 1000) : null,
        streams);
  }

  @Override
  public byte[] frame(String url, double atSeconds) throws MediaException {
    var at = String.format(Locale.ROOT, "%.3f", Math.max(0, atSeconds));
    return run(
        List.of(
            properties.ffmpeg(),
            "-v",
            "error",
            "-ss",
            at,
            "-i",
            url,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            "-f",
            "image2",
            "-c:v",
            "mjpeg",
            "-q:v",
            "4",
            "pipe:1"),
        MAX_FRAME_BYTES,
        "take a thumbnail from this video");
  }

  @Override
  public String subtitles(String url, int streamIndex) throws MediaException {
    var out =
        run(
            List.of(
                properties.ffmpeg(),
                "-v",
                "error",
                "-i",
                url,
                "-map",
                "0:" + streamIndex,
                "-f",
                "webvtt",
                "pipe:1"),
            MAX_SUBTITLE_BYTES,
            "read this video's subtitles");
    return new String(out, StandardCharsets.UTF_8);
  }

  private byte[] run(List<String> command, int maxBytes, String what) throws MediaException {
    final Process process;
    try {
      process =
          new ProcessBuilder(command)
              .redirectError(ProcessBuilder.Redirect.DISCARD)
              .redirectInput(ProcessBuilder.Redirect.from(nullFile()))
              .start();
    } catch (IOException e) {
      log.error("Could not start {}: {}", command.get(0), e.toString());
      throw new MediaException(
          "Video processing isn't available on this server (ffmpeg is missing).");
    }
    var output = new ByteArrayOutputStream();
    var tooBig = new boolean[1];
    var reader =
        Thread.ofVirtual()
            .start(
                () -> {
                  try (InputStream in = process.getInputStream()) {
                    var buffer = new byte[64 * 1024];
                    for (int n; (n = in.read(buffer)) > 0; ) {
                      if (output.size() + n > maxBytes) {
                        tooBig[0] = true;
                        process.destroyForcibly();
                        return;
                      }
                      output.write(buffer, 0, n);
                    }
                  } catch (IOException ignored) {
                    // The process was stopped; what was read so far is discarded below.
                  }
                });
    try {
      if (!process.waitFor(properties.timeout().toMillis(), TimeUnit.MILLISECONDS)) {
        process.destroyForcibly();
        throw new MediaException("Reading this video took too long, so it was stopped.");
      }
      reader.join(Duration.ofSeconds(5));
    } catch (InterruptedException e) {
      process.destroyForcibly();
      Thread.currentThread().interrupt();
      throw new MediaException("Processing was interrupted.");
    }
    if (tooBig[0]) {
      throw new MediaException("This video's details were too large to read.");
    }
    if (process.exitValue() != 0) {
      throw new MediaException("We couldn't " + what + ".");
    }
    return output.toByteArray();
  }

  private static java.io.File nullFile() {
    return new java.io.File(
        System.getProperty("os.name").startsWith("Windows") ? "NUL" : "/dev/null");
  }

  private static String text(JsonNode node, String field) {
    var value = node.path(field);
    return value.isMissingNode() || value.isNull() ? null : value.asString();
  }

  private static double parseDouble(String value) {
    try {
      return value == null ? 0 : Double.parseDouble(value);
    } catch (NumberFormatException e) {
      return 0;
    }
  }
}
