package dev.ossm.api.ingest;

import dev.ossm.api.storage.Bucket;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * The ingest job: reads an uploaded file back from the store, reads its tags and cover, and writes
 * the artist, album and track rows. Safe to run again after a crash: a finished upload is skipped
 * and the database writes happen in one transaction.
 */
@Service
class IngestService {

  private static final Logger log = LoggerFactory.getLogger(IngestService.class);
  private static final String UNKNOWN_ARTIST = "Unknown Artist";
  private static final Pattern WHITESPACE = Pattern.compile("\\s+");
  private static final Pattern SAFE_EXTENSION = Pattern.compile("\\.[a-z0-9]{1,5}");

  private final JdbcClient jdbc;
  private final S3Client s3;
  private final Bucket bucket;
  private final TransactionTemplate transaction;

  IngestService(JdbcClient jdbc, S3Client s3, Bucket bucket, TransactionTemplate transaction) {
    this.jdbc = jdbc;
    this.s3 = s3;
    this.bucket = bucket;
    this.transaction = transaction;
  }

  private record UploadRow(
      UUID id, UUID userId, String filename, long sizeBytes, String objectKey, String status) {}

  void ingest(UUID uploadId) {
    var upload =
        jdbc.sql(
                "select id, user_id, filename, size_bytes, object_key, status from upload"
                    + " where id = :id")
            .param("id", uploadId)
            .query(
                (rs, i) ->
                    new UploadRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("filename"),
                        rs.getLong("size_bytes"),
                        rs.getString("object_key"),
                        rs.getString("status")))
            .optional();
    if (upload.isEmpty()
        || upload.get().status().equals("DONE")
        || upload.get().status().equals("FAILED")) {
      return;
    }
    var row = upload.get();
    Path dir = null;
    try {
      dir = Files.createTempDirectory("ossm-ingest");
      var file = dir.resolve("audio" + extensionOf(row.filename()));
      var sha256 = download(row.objectKey(), file);
      final TagReader.Parsed parsed;
      try {
        parsed = TagReader.read(file);
      } catch (TagReader.UnreadableAudioException e) {
        log.info(
            "Upload {} is not readable audio: {}",
            uploadId,
            e.getCause() == null ? e.getMessage() : e.getCause().toString());
        fail(uploadId, e.getMessage());
        return;
      }
      var coverKey = parsed.cover() == null ? null : storeCover(parsed.cover());
      transaction.executeWithoutResult(status -> persist(row, parsed, sha256, coverKey));
      log.info("Ingested upload {} ({} ms)", uploadId, parsed.durationMs());
    } catch (NoSuchKeyException e) {
      fail(uploadId, "The uploaded file could not be found in storage.");
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } finally {
      deleteQuietly(dir);
    }
  }

  private String download(String key, Path target) throws IOException {
    var digest = sha256();
    try (var in = s3.getObject(b -> b.bucket(bucket.ensure()).key(key));
        var out = Files.newOutputStream(target)) {
      var buffer = new byte[64 * 1024];
      for (int n; (n = in.read(buffer)) > 0; ) {
        digest.update(buffer, 0, n);
        out.write(buffer, 0, n);
      }
    }
    return HexFormat.of().formatHex(digest.digest());
  }

  /** Cover art is content-addressed, so storing it twice is harmless. */
  private String storeCover(TagReader.Cover cover) {
    var hash = HexFormat.of().formatHex(sha256().digest(cover.bytes()));
    var key =
        "covers/%s/%s.%s".formatted(hash.substring(0, 2), hash, extensionFor(cover.mimeType()));
    s3.putObject(
        PutObjectRequest.builder()
            .bucket(bucket.ensure())
            .key(key)
            .contentType(cover.mimeType())
            .build(),
        RequestBody.fromBytes(cover.bytes()));
    return key;
  }

  private void persist(UploadRow upload, TagReader.Parsed tags, String sha256, String coverKey) {
    var artistId = upsertArtist(orDefault(tags.artist(), UNKNOWN_ARTIST));
    UUID albumId = null;
    if (tags.album() != null) {
      var albumArtistId = tags.albumArtist() == null ? artistId : upsertArtist(tags.albumArtist());
      albumId = upsertAlbum(tags.album(), albumArtistId, tags.year());
      if (coverKey != null) {
        jdbc.sql("update album set cover_key = :key where id = :id and cover_key is null")
            .param("key", coverKey)
            .param("id", albumId)
            .update();
      }
    }
    var trackId = UUID.randomUUID();
    jdbc.sql(
            "insert into track (id, title, artist_id, album_id, track_number, disc_number, year,"
                + " genre, duration_ms, codec, bitrate_kbps, content_hash, object_key, size_bytes,"
                + " uploader_id) values (:id, :title, :artist, :album, :trackNumber, :discNumber,"
                + " :year, :genre, :duration, :codec, :bitrate, :hash, :objectKey, :size, :uploader)")
        .param("id", trackId)
        .param("title", orDefault(tags.title(), stem(upload.filename())))
        .param("artist", artistId)
        .param("album", albumId)
        .param("trackNumber", tags.trackNumber())
        .param("discNumber", tags.discNumber())
        .param("year", tags.year())
        .param("genre", tags.genre())
        .param("duration", tags.durationMs())
        .param("codec", tags.codec())
        .param("bitrate", tags.bitrateKbps())
        .param("hash", sha256)
        .param("objectKey", upload.objectKey())
        .param("size", upload.sizeBytes())
        .param("uploader", upload.userId())
        .update();
    var finished =
        jdbc.sql(
                "update upload set status = 'DONE', track_id = :track, error = null,"
                    + " updated_at = now() where id = :id and status in ('UPLOADING', 'INGESTING')")
            .param("track", trackId)
            .param("id", upload.id())
            .update();
    if (finished == 0) {
      // Someone else finished or failed this upload meanwhile; undo our track.
      throw new IllegalStateException("Upload " + upload.id() + " is no longer being ingested");
    }
  }

  private UUID upsertArtist(String name) {
    return jdbc.sql(
            "insert into artist (id, name, name_key) values (:id, :name, :key)"
                + " on conflict (name_key) do update set name = artist.name returning id")
        .param("id", UUID.randomUUID())
        .param("name", name)
        .param("key", key(name))
        .query(UUID.class)
        .single();
  }

  private UUID upsertAlbum(String title, UUID artistId, Integer year) {
    return jdbc.sql(
            "insert into album (id, title, title_key, artist_id, year)"
                + " values (:id, :title, :key, :artist, :year)"
                + " on conflict (artist_id, title_key)"
                + " do update set year = coalesce(album.year, excluded.year) returning id")
        .param("id", UUID.randomUUID())
        .param("title", title)
        .param("key", key(title))
        .param("artist", artistId)
        .param("year", year)
        .query(UUID.class)
        .single();
  }

  private void fail(UUID uploadId, String reason) {
    jdbc.sql(
            "update upload set status = 'FAILED', error = :error, updated_at = now()"
                + " where id = :id and status in ('UPLOADING', 'INGESTING')")
        .param("error", reason)
        .param("id", uploadId)
        .update();
  }

  /** Names match regardless of case and spacing: "Daft Punk" and " daft punk" are one artist. */
  static String key(String name) {
    return WHITESPACE.matcher(name.strip()).replaceAll(" ").toLowerCase(Locale.ROOT);
  }

  static String extensionOf(String filename) {
    var dot = filename.lastIndexOf('.');
    if (dot < 0) {
      return ".bin";
    }
    var extension = filename.substring(dot).toLowerCase(Locale.ROOT);
    return SAFE_EXTENSION.matcher(extension).matches() ? extension : ".bin";
  }

  private static String stem(String filename) {
    var name = filename.substring(filename.lastIndexOf('/') + 1);
    var dot = name.lastIndexOf('.');
    var stem = dot > 0 ? name.substring(0, dot) : name;
    return stem.isBlank() ? "Untitled" : stem.strip();
  }

  private static String orDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  private static String extensionFor(String mimeType) {
    return switch (mimeType.toLowerCase(Locale.ROOT)) {
      case "image/jpeg", "image/jpg" -> "jpg";
      case "image/png" -> "png";
      case "image/gif" -> "gif";
      case "image/webp" -> "webp";
      default -> "img";
    };
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static void deleteQuietly(Path dir) {
    if (dir == null) {
      return;
    }
    try (var paths = Files.walk(dir)) {
      paths.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
    } catch (IOException ignored) {
      // Temp files; the OS will clean them up eventually.
    }
  }
}
