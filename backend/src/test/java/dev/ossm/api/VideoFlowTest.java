package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Video uploads end to end (spec 03): real Postgres, real SeaweedFS, real ffprobe/ffmpeg. The tests
 * that ingest need ffmpeg on the PATH (ADR 0010) and are skipped without it; CI installs it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class VideoFlowTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @TempDir Path dir;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  private Session admin() throws Exception {
    var admin = new Session(port);
    assertThat(admin.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    return admin;
  }

  private static boolean ffmpegAvailable() {
    try {
      var p = new ProcessBuilder("ffmpeg", "-version").redirectErrorStream(true).start();
      p.getInputStream().readAllBytes();
      return p.waitFor(20, TimeUnit.SECONDS) && p.exitValue() == 0;
    } catch (Exception e) {
      return false;
    }
  }

  /** A few seconds of test pattern and tone, made with ffmpeg. */
  private byte[] video(String name, List<String> encoding) throws Exception {
    var out = dir.resolve(name);
    var command =
        new java.util.ArrayList<>(
            List.of(
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=24",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000"));
    command.addAll(encoding);
    command.addAll(List.of("-t", "3", out.toString()));
    var p = new ProcessBuilder(command).redirectErrorStream(true).start();
    var log = new String(p.getInputStream().readAllBytes());
    assertThat(p.waitFor()).as(log).isZero();
    return Files.readAllBytes(out);
  }

  private byte[] mp4() throws Exception {
    return video(
        "clip.mp4",
        List.of(
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"));
  }

  @Test
  void anMp4BecomesAMovieWithAThumbnailThatStreamsByRange() throws Exception {
    assumeTrue(ffmpegAvailable(), "ffmpeg is not installed");
    var user = admin();
    var bytes = mp4();

    var started = StoreClient.start(user, "Test Pattern (2024).mp4", bytes.length);
    assertThat(started.ticketJson()).contains("\"kind\":\"VIDEO\"").contains("\"partCount\":1");
    var complete =
        user.post(
            "/api/v1/uploads/" + started.uploadId() + "/complete",
            StoreClient.putParts(started, bytes));
    assertThat(complete.statusCode()).isEqualTo(202);

    var finished = StoreClient.awaitFinished(user, started.uploadId());
    assertThat(finished).contains("\"status\":\"DONE\"").contains("\"videoId\"");
    var videoId = StoreClient.first(finished, "\"videoId\":\"([^\"]+)\"");

    var movies = user.get("/api/v1/videos?kind=MOVIE");
    assertThat(movies.headers().firstValue("X-Total-Count")).contains("1");
    assertThat(movies.body())
        .contains("\"title\":\"Test Pattern\"")
        .contains("\"year\":2024")
        .contains("\"kind\":\"MOVIE\"")
        .contains("\"width\":320")
        .contains("\"height\":180")
        .contains("\"videoCodec\":\"h264\"")
        .contains("\"audioCodec\":\"aac\"")
        .contains("\"container\":\"mp4\"")
        .contains("\"playable\":true")
        .contains("\"thumbnailUrl\":\"/api/v1/videos/" + videoId + "/thumbnail\"");
    var duration = Long.parseLong(StoreClient.first(movies.body(), "\"durationMs\":(\\d+)"));
    assertThat(duration).isBetween(2_800L, 3_300L);

    var thumbnail = user.getBytes("/api/v1/videos/" + videoId + "/thumbnail");
    assertThat(thumbnail.statusCode()).isEqualTo(200);
    assertThat(thumbnail.headers().firstValue("Content-Type")).contains("image/jpeg");
    assertThat(thumbnail.body()[0] & 0xFF).isEqualTo(0xFF); // JPEG SOI
    assertThat(thumbnail.body()[1] & 0xFF).isEqualTo(0xD8);

    var range = user.getBytes("/api/v1/videos/" + videoId + "/stream", "bytes=100-199");
    assertThat(range.statusCode()).isEqualTo(206);
    assertThat(range.headers().firstValue("Content-Type")).contains("video/mp4");
    assertThat(range.headers().firstValue("Content-Range"))
        .contains("bytes 100-199/" + bytes.length);
    assertThat(range.body()).isEqualTo(java.util.Arrays.copyOfRange(bytes, 100, 200));

    // The same file again is recognised and not stored twice.
    var again = StoreClient.upload(user, "copy.mp4", bytes);
    assertThat(StoreClient.awaitFinished(user, again))
        .contains("\"status\":\"DUPLICATE\"")
        .contains("\"videoId\":\"" + videoId + "\"");
  }

  @Test
  void episodesAreFiledUnderTheirShowAndProgressResumes() throws Exception {
    assumeTrue(ffmpegAvailable(), "ffmpeg is not installed");
    var user = admin();
    var first = mp4();
    var second =
        video(
            "b.mp4",
            List.of("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-crf", "35"));

    var one = StoreClient.upload(user, "Night.Kitchen.S01E01.Mise.en.Place.mp4", first);
    var two = StoreClient.upload(user, "Night Kitchen S01E02.mp4", second);
    var e1 = StoreClient.first(StoreClient.awaitFinished(user, one), "\"videoId\":\"([^\"]+)\"");
    var e2 = StoreClient.first(StoreClient.awaitFinished(user, two), "\"videoId\":\"([^\"]+)\"");

    var shows = user.get("/api/v1/shows");
    assertThat(shows.body())
        .contains("\"name\":\"Night Kitchen\"")
        .contains("\"seasonCount\":1")
        .contains("\"episodeCount\":2");
    var showId = StoreClient.first(shows.body(), "\"id\":\"([^\"]+)\"");

    var detail = user.get("/api/v1/videos/" + e1).body();
    assertThat(detail)
        .contains("\"showName\":\"Night Kitchen\"")
        .contains("\"title\":\"Mise en Place\"")
        .contains("\"canEdit\":true");
    // Up next from E1 is E2.
    assertThat(detail.indexOf("\"id\":\"" + e2 + "\"")).isPositive();

    var saved =
        user.put("/api/v1/videos/" + e1 + "/progress", "{\"positionMs\":1200,\"durationMs\":3000}");
    assertThat(saved.statusCode()).isEqualTo(200);
    assertThat(saved.body()).contains("\"watched\":false");
    assertThat(user.get("/api/v1/videos/continue-watching").body()).contains(e1);

    var show = user.get("/api/v1/shows/" + showId).body();
    assertThat(show).contains("\"resume\":{\"id\":\"" + e1 + "\"");

    // Finishing E1 moves the show on to E2.
    user.put("/api/v1/videos/" + e1 + "/progress", "{\"positionMs\":2900,\"durationMs\":3000}");
    assertThat(user.get("/api/v1/videos/continue-watching").body()).doesNotContain(e1);
    assertThat(user.get("/api/v1/shows/" + showId).body())
        .contains("\"resume\":{\"id\":\"" + e2 + "\"");

    // A misread episode turns into a movie; the show keeps the other one.
    var edited =
        user.patch(
            "/api/v1/videos/" + e2,
            "{\"kind\":\"MOVIE\",\"title\":\"Behind the Scenes\",\"year\":2025}");
    assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
    assertThat(edited.body()).contains("\"kind\":\"MOVIE\"").doesNotContain("showId");
    assertThat(user.get("/api/v1/shows").body()).contains("\"episodeCount\":1");
  }

  @Test
  void aSidecarSubtitleFileIsAddedAsWebVtt() throws Exception {
    assumeTrue(ffmpegAvailable(), "ffmpeg is not installed");
    var user = admin();
    var id = StoreClient.upload(user, "Subbed.mp4", mp4());
    var videoId =
        StoreClient.first(StoreClient.awaitFinished(user, id), "\"videoId\":\"([^\"]+)\"");

    var added =
        user.postMultipart(
            "/api/v1/videos/" + videoId + "/subtitles",
            "Subbed.en.srt",
            "1\r\n00:00:00,500 --> 00:00:01,500\r\nHello\r\n".getBytes());
    assertThat(added.statusCode()).as(added.body()).isEqualTo(201);
    assertThat(added.body()).contains("\"language\":\"en\"").contains("\"label\":\"English\"");

    var vtt = user.get("/api/v1/videos/" + videoId + "/subtitles/0");
    assertThat(vtt.statusCode()).isEqualTo(200);
    assertThat(vtt.body()).startsWith("WEBVTT").contains("00:00:00.500 --> 00:00:01.500");
    assertThat(user.get("/api/v1/videos/" + videoId).body()).contains("\"label\":\"English\"");
  }

  @Test
  void aFileThatIsNotAVideoFailsWithAReadableReason() throws Exception {
    var user = admin();
    var id = StoreClient.upload(user, "notes.mp4", "plain text, renamed".getBytes());
    assertThat(StoreClient.awaitFinished(user, id))
        .contains("\"status\":\"FAILED\"")
        .contains("isn't a video OSSM can read");
  }

  @Test
  void videosMayBeUpTo20GbAndGetTheirPartUrlsInPages() throws Exception {
    var user = admin();

    // 3 GiB: 192 parts of 16 MiB fit one page; 4 GiB needs a second page.
    var big = 4L * 1024 * 1024 * 1024;
    var started = StoreClient.start(user, "Long Film.mkv", big);
    assertThat(started.ticketJson()).contains("\"partCount\":256");
    assertThat(started.partUrls()).hasSize(200);
    var more = user.get("/api/v1/uploads/" + started.uploadId() + "/parts?from=201");
    assertThat(more.statusCode()).isEqualTo(200);
    assertThat(more.body()).contains("\"partNumber\":201").contains("\"partNumber\":256");
    assertThat(more.body()).doesNotContain("\"partNumber\":200,");

    var tooBig =
        user.post(
            "/api/v1/uploads",
            "{\"filename\":\"huge.mkv\",\"sizeBytes\":%d}".formatted(21L * 1024 * 1024 * 1024));
    assertThat(tooBig.statusCode()).isEqualTo(400);
    assertThat(tooBig.body()).contains("20 GB");

    // Audio keeps its 250 MB limit.
    var bigAudio =
        user.post(
            "/api/v1/uploads",
            "{\"filename\":\"long.flac\",\"sizeBytes\":%d}".formatted(300L * 1024 * 1024));
    assertThat(bigAudio.statusCode()).isEqualTo(400);
    assertThat(bigAudio.body()).contains("250 MB");
  }

  @Test
  void videosNeedALogin() throws Exception {
    var anonymous = new Session(port);
    assertThat(anonymous.get("/api/v1/videos").statusCode()).isEqualTo(401);
    assertThat(anonymous.get("/api/v1/shows").statusCode()).isEqualTo(401);
  }
}
