package dev.ossm.api.ingest;

import dev.ossm.api.ingest.MediaProbe.MediaException;
import dev.ossm.api.ingest.MediaProbe.Probe;
import dev.ossm.api.ingest.MediaProbe.Stream;
import dev.ossm.api.storage.Bucket;
import dev.ossm.api.storage.InternalUrls;
import dev.ossm.api.video.ShowRows;
import dev.ossm.api.video.Subtitles;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * Ingest for a video upload (spec 03, ADR 0010): what the file is from its bytes, its streams from
 * ffprobe, a SHA-256 for duplicates, one thumbnail, its text subtitles, and a movie or episode row
 * named from the filename. Store and database faults throw, so the queue retries; a file that
 * cannot be read fails for good with a reason people can read.
 */
@Service
class VideoIngestService {

  private static final Logger log = LoggerFactory.getLogger(VideoIngestService.class);
  private static final Duration URL_LIFETIME = Duration.ofMinutes(30);
  private static final Set<String> TEXT_SUBTITLES =
      Set.of("subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text");

  static final String NOT_A_VIDEO =
      "This isn't a video OSSM can read. Use MP4, M4V, MOV, WebM or MKV.";
  static final String NO_VIDEO_STREAM =
      "No video stream found. If this is music, upload it as an audio file (for example .m4a).";

  private final JdbcClient jdbc;
  private final S3Client s3;
  private final Bucket bucket;
  private final InternalUrls urls;
  private final MediaProbe media;
  private final TransactionTemplate transaction;

  VideoIngestService(
      JdbcClient jdbc,
      S3Client s3,
      Bucket bucket,
      InternalUrls urls,
      MediaProbe media,
      TransactionTemplate transaction) {
    this.jdbc = jdbc;
    this.s3 = s3;
    this.bucket = bucket;
    this.urls = urls;
    this.media = media;
    this.transaction = transaction;
  }

  record Upload(
      UUID id, UUID userId, String filename, long sizeBytes, String objectKey, String license) {}

  private record Sub(int index, String language, String label, String key) {}

  void ingest(Upload upload) {
    var container = VideoSniffer.detect(head(upload.objectKey()));
    if (container.isEmpty()) {
      fail(upload.id(), NOT_A_VIDEO);
      return;
    }
    var url = urls.read(upload.objectKey(), URL_LIFETIME);
    final Probe probe;
    try {
      probe = media.probe(url);
    } catch (MediaException e) {
      fail(upload.id(), e.getMessage());
      return;
    }
    var video =
        probe.streams().stream()
            .filter(s -> "video".equals(s.type()) && !s.attachedPicture())
            .findFirst();
    if (video.isEmpty()) {
      fail(upload.id(), NO_VIDEO_STREAM);
      return;
    }
    var audio = probe.streams().stream().filter(s -> "audio".equals(s.type())).findFirst();

    var sha256 = hash(upload.objectKey());
    var existing = videoWithHash(sha256);
    if (existing.isPresent()) {
      markDuplicate(upload, existing.get());
      return;
    }

    var videoId = UUID.randomUUID();
    var thumbnailKey = thumbnail(upload, url, probe.durationMs());
    var subtitles = subtitles(upload, url, videoId, probe.streams());
    var names = VideoNames.parse(upload.filename());
    var playable =
        Playability.playable(
            container.get(), video.get().codec(), audio.map(Stream::codec).orElse(null));
    try {
      transaction.executeWithoutResult(
          status ->
              persist(
                  upload,
                  videoId,
                  names,
                  probe,
                  video.get(),
                  audio.orElse(null),
                  container.get(),
                  playable,
                  sha256,
                  thumbnailKey,
                  subtitles));
      log.info(
          "Ingested video upload {} as {} ({} ms)", upload.id(), names.kind(), probe.durationMs());
    } catch (DuplicateKeyException race) {
      markDuplicate(upload, videoWithHash(sha256).orElseThrow(() -> race));
    }
  }

  /** The first 4 KiB, which is all the sniffer needs. */
  private byte[] head(String key) {
    try (var in = s3.getObject(b -> b.bucket(bucket.ensure()).key(key).range("bytes=0-4095"))) {
      return in.readAllBytes();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Read once, start to end, without a temp file: videos can be 20 GB. */
  private String hash(String key) {
    var digest = sha256();
    try (var in = s3.getObject(b -> b.bucket(bucket.ensure()).key(key))) {
      var buffer = new byte[256 * 1024];
      for (int n; (n = in.read(buffer)) > 0; ) {
        digest.update(buffer, 0, n);
      }
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return HexFormat.of().formatHex(digest.digest());
  }

  /**
   * A frame 10% in, between 5 seconds and 5 minutes (half way for clips under 10 s). A video with
   * no thumbnail is still a video, so a failure here is only logged.
   */
  private String thumbnail(Upload upload, String url, long durationMs) {
    double seconds = durationMs / 1000.0;
    double at = seconds < 10 ? seconds / 2 : Math.min(300, Math.max(5, seconds * 0.1));
    try {
      var jpeg = media.frame(url, at);
      if (jpeg.length == 0) {
        return null;
      }
      var hash = HexFormat.of().formatHex(sha256().digest(jpeg));
      var key = "thumbs/%s/%s.jpg".formatted(hash.substring(0, 2), hash);
      s3.putObject(
          PutObjectRequest.builder()
              .bucket(bucket.ensure())
              .key(key)
              .contentType("image/jpeg")
              .build(),
          RequestBody.fromBytes(jpeg));
      return key;
    } catch (MediaException e) {
      log.info("No thumbnail for upload {}: {}", upload.id(), e.getMessage());
      return null;
    }
  }

  /** Text subtitle streams as WebVTT. Image subtitles (PGS, VobSub) are skipped. */
  private List<Sub> subtitles(Upload upload, String url, UUID videoId, List<Stream> streams) {
    var result = new ArrayList<Sub>();
    for (var stream : streams) {
      if (!"subtitle".equals(stream.type()) || !TEXT_SUBTITLES.contains(stream.codec())) {
        continue;
      }
      try {
        var vtt = media.subtitles(url, stream.index());
        if (vtt.isBlank()) {
          continue;
        }
        int index = result.size();
        var language = Subtitles.normalizeLanguage(stream.language());
        var key = "subs/%s/%d.vtt".formatted(videoId, index);
        s3.putObject(
            PutObjectRequest.builder()
                .bucket(bucket.ensure())
                .key(key)
                .contentType("text/vtt")
                .build(),
            RequestBody.fromString(Subtitles.toVtt(vtt), StandardCharsets.UTF_8));
        result.add(new Sub(index, language, Subtitles.label(language, stream.title(), index), key));
      } catch (MediaException e) {
        log.info(
            "Skipped subtitle stream {} of upload {}: {}",
            stream.index(),
            upload.id(),
            e.getMessage());
      }
    }
    return result;
  }

  private void persist(
      Upload upload,
      UUID videoId,
      VideoNames.Parsed names,
      Probe probe,
      Stream video,
      Stream audio,
      VideoSniffer.Container container,
      boolean playable,
      String sha256,
      String thumbnailKey,
      List<Sub> subtitles) {
    UUID showId = names.kind().equals("EPISODE") ? ShowRows.upsert(jdbc, names.show()) : null;
    jdbc.sql(
            "insert into video (id, kind, title, year, show_id, season, episode, duration_ms, width,"
                + " height, video_codec, audio_codec, container, bitrate_kbps, playable,"
                + " content_hash, object_key, size_bytes, thumbnail_key, license, uploader_id)"
                + " values (:id, :kind, :title, :year, :show, :season, :episode, :duration, :width,"
                + " :height, :videoCodec, :audioCodec, :container, :bitrate, :playable, :hash,"
                + " :key, :size, :thumb, :license, :uploader)")
        .param("id", videoId)
        .param("kind", names.kind())
        .param("title", names.title())
        .param("year", names.year())
        .param("show", showId)
        .param("season", names.season())
        .param("episode", names.episode())
        .param("duration", probe.durationMs())
        .param("width", video.width())
        .param("height", video.height())
        .param("videoCodec", video.codec())
        .param("audioCodec", audio == null ? null : audio.codec())
        .param("container", container.extension)
        .param("bitrate", probe.bitrateKbps())
        .param("playable", playable)
        .param("hash", sha256)
        .param("key", upload.objectKey())
        .param("size", upload.sizeBytes())
        .param("thumb", thumbnailKey)
        .param("license", upload.license())
        .param("uploader", upload.userId())
        .update();
    for (var sub : subtitles) {
      jdbc.sql(
              "insert into subtitle (video_id, idx, language, label, object_key)"
                  + " values (:video, :idx, :language, :label, :key)")
          .param("video", videoId)
          .param("idx", sub.index())
          .param("language", sub.language())
          .param("label", sub.label())
          .param("key", sub.key())
          .update();
    }
    var finished =
        jdbc.sql(
                "update upload set status = 'DONE', video_id = :video, error = null,"
                    + " updated_at = now() where id = :id and status in ('UPLOADING', 'INGESTING')")
            .param("video", videoId)
            .param("id", upload.id())
            .update();
    if (finished == 0) {
      throw new IllegalStateException("Upload " + upload.id() + " is no longer being ingested");
    }
  }

  private Optional<UUID> videoWithHash(String sha256) {
    return jdbc.sql("select id from video where content_hash = :hash")
        .param("hash", sha256)
        .query(UUID.class)
        .optional();
  }

  private void markDuplicate(Upload upload, UUID existing) {
    try {
      s3.deleteObject(b -> b.bucket(bucket.ensure()).key(upload.objectKey()));
    } catch (RuntimeException e) {
      log.warn("Could not remove the duplicate object {}: {}", upload.objectKey(), e.toString());
    }
    jdbc.sql(
            "update upload set status = 'DUPLICATE', video_id = :video, error = null,"
                + " updated_at = now() where id = :id and status in ('UPLOADING', 'INGESTING')")
        .param("video", existing)
        .param("id", upload.id())
        .update();
    log.info("Upload {} duplicates video {}", upload.id(), existing);
  }

  private void fail(UUID uploadId, String reason) {
    jdbc.sql(
            "update upload set status = 'FAILED', error = :error, updated_at = now()"
                + " where id = :id and status in ('UPLOADING', 'INGESTING')")
        .param("error", reason)
        .param("id", uploadId)
        .update();
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
