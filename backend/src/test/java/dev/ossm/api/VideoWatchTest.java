package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import software.amazon.awssdk.services.s3.S3Client;

/** Watching and downloading from the outside: ranges, headers, bytes, and who may ask. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class VideoWatchTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired S3Client s3;

  @Value("${ossm.storage.bucket}")
  String bucket;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  private Session admin;

  private Session memberOf(String username) throws Exception {
    if (admin == null) {
      admin = new Session(port);
      assertThat(admin.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    }
    var invite =
        admin.post("/api/v1/users", "{\"username\":\"%s\",\"role\":\"USER\"}".formatted(username));
    var token = StoreClient.first(invite.body(), "\"token\":\"([^\"]+)\"");
    var member = new Session(port);
    member.post(
        "/api/v1/invites/" + token + "/accept", "{\"password\":\"a long enough password\"}");
    return member;
  }

  /** A video owned by "grace", with the exact bytes that went in. */
  private record Stored(Session owner, String id, byte[] bytes) {
    String stream() {
      return "/api/v1/videos/" + id + "/stream";
    }

    String download() {
      return "/api/v1/videos/" + id + "/download";
    }
  }

  private Stored stored(String filename, byte[] bytes) throws Exception {
    var grace = memberOf("grace");
    var id = StoreClient.uploadVideo(grace, filename, bytes);
    assertThat(StoreClient.awaitFinished(grace, id)).contains("\"status\":\"DONE\"");
    return new Stored(grace, id, bytes);
  }

  private Stored mp4() throws Exception {
    return stored("beach.mp4", VideoFixture.mp4(11));
  }

  @Test
  void theOriginalStreamsInFullWithTheHeadersAPlayerNeeds() throws Exception {
    var v = mp4();

    var response = v.owner().getBytes(v.stream());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).isEqualTo(v.bytes());
    assertThat(response.headers().firstValue("Content-Type")).contains("video/mp4");
    assertThat(response.headers().firstValue("Accept-Ranges")).contains("bytes");
    assertThat(response.headers().firstValue("Content-Length")).contains("" + v.bytes().length);
    assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("private");
  }

  @Test
  void theContentTypeComesFromTheContainerNotTheFileName() throws Exception {
    var v = stored("renamed.mp4", VideoFixture.webm(12));

    var response = v.owner().getBytes(v.stream());

    assertThat(response.headers().firstValue("Content-Type")).contains("video/webm");
  }

  @Test
  void aRangeReturnsExactlyThoseBytes() throws Exception {
    var v = mp4();
    int from = v.bytes().length / 2;

    var head = v.owner().getBytes(v.stream(), "bytes=0-99");
    var middle = v.owner().getBytes(v.stream(), "bytes=" + from + "-" + (from + 999));

    assertThat(head.statusCode()).isEqualTo(206);
    assertThat(head.body()).isEqualTo(Arrays.copyOfRange(v.bytes(), 0, 100));
    assertThat(head.headers().firstValue("Content-Range"))
        .contains("bytes 0-99/" + v.bytes().length);
    assertThat(middle.statusCode()).isEqualTo(206);
    assertThat(middle.body()).isEqualTo(Arrays.copyOfRange(v.bytes(), from, from + 1000));
    assertThat(middle.headers().firstValue("Content-Range"))
        .contains("bytes %d-%d/%d".formatted(from, from + 999, v.bytes().length));
  }

  @Test
  void anOpenEndedRangeAndASuffixRangeBothReachTheEnd() throws Exception {
    var v = mp4();
    int n = v.bytes().length;

    var open = v.owner().getBytes(v.stream(), "bytes=" + (n - 500) + "-");
    var suffix = v.owner().getBytes(v.stream(), "bytes=-128");

    assertThat(open.statusCode()).isEqualTo(206);
    assertThat(open.body()).isEqualTo(Arrays.copyOfRange(v.bytes(), n - 500, n));
    assertThat(open.headers().firstValue("Content-Range"))
        .contains("bytes %d-%d/%d".formatted(n - 500, n - 1, n));
    assertThat(suffix.statusCode()).isEqualTo(206);
    assertThat(suffix.body()).isEqualTo(Arrays.copyOfRange(v.bytes(), n - 128, n));
    assertThat(suffix.headers().firstValue("Content-Range"))
        .contains("bytes %d-%d/%d".formatted(n - 128, n - 1, n));
  }

  @Test
  void aRangeStartingPastTheEndIsNotSatisfiable() throws Exception {
    var v = mp4();

    var response = v.owner().getBytes(v.stream(), "bytes=" + v.bytes().length + "-");

    assertThat(response.statusCode()).isEqualTo(416);
    assertThat(response.headers().firstValue("Content-Range"))
        .contains("bytes */" + v.bytes().length);
  }

  @Test
  void aMalformedOrMultipleRangeSendsTheWholeFile() throws Exception {
    var v = mp4();

    for (var range : new String[] {"bytes=abc", "items=0-9", "bytes=0-9,20-29", "bytes=5-2"}) {
      var response = v.owner().getBytes(v.stream(), range);
      assertThat(response.statusCode()).as(range).isEqualTo(200);
      assertThat(response.body()).as(range).isEqualTo(v.bytes());
    }
  }

  @Test
  void theDownloadIsTheUploadedFileByteForByteUnderItsOriginalName() throws Exception {
    var v = stored("Beach Day.mp4", VideoFixture.mp4(13));

    var response = v.owner().getBytes(v.download());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(sha256(response.body())).isEqualTo(sha256(v.bytes()));
    assertThat(response.headers().firstValue("Content-Disposition"))
        .contains("attachment; filename=\"Beach Day.mp4\"; filename*=UTF-8''Beach%20Day.mp4");
    assertThat(response.headers().firstValue("Content-Type")).contains("video/mp4");
    assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("private");
  }

  @Test
  void aNonAsciiFileNameSurvivesTheDownload() throws Exception {
    var v = stored("Café ☕ 日本.mp4", VideoFixture.mp4(14));

    var response = v.owner().getBytes(v.download());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(sha256(response.body())).isEqualTo(sha256(v.bytes()));
    var disposition = response.headers().firstValue("Content-Disposition").orElseThrow();
    assertThat(disposition)
        .startsWith("attachment;")
        .contains("filename*=UTF-8''Caf%C3%A9%20%E2%98%95%20%E6%97%A5%E6%9C%AC.mp4");
  }

  @Test
  void aDownloadCanResumeWithARange() throws Exception {
    var v = mp4();

    var response = v.owner().getBytes(v.download(), "bytes=100-199");

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body()).isEqualTo(Arrays.copyOfRange(v.bytes(), 100, 200));
    assertThat(response.headers().firstValue("Content-Disposition").orElse(""))
        .startsWith("attachment;");
  }

  @Test
  void theDetailHasTheTitleAndTheOriginalFileName() throws Exception {
    var v = stored("Birthday Party.mp4", VideoFixture.mp4(15));

    var response = v.owner().get("/api/v1/videos/" + v.id());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body())
        .contains("\"id\":\"" + v.id() + "\"")
        .contains("\"title\":\"Birthday Party\"")
        .contains("\"originalFilename\":\"Birthday Party.mp4\"")
        .contains("\"container\":\"MP4\"")
        .contains("\"sizeBytes\":" + v.bytes().length);
  }

  @Test
  void anotherUserAndAnAdminGetNotFoundOnDetailStreamAndDownload() throws Exception {
    var v = mp4();
    var heidi = memberOf("heidi");

    for (var who : new Session[] {heidi, admin}) {
      assertThat(who.get("/api/v1/videos/" + v.id()).statusCode()).isEqualTo(404);
      assertThat(who.getBytes(v.stream()).statusCode()).isEqualTo(404);
      assertThat(who.getBytes(v.download()).statusCode()).isEqualTo(404);
      // Asking for a range changes nothing: still no bytes, and still not a 416.
      assertThat(who.getBytes(v.stream(), "bytes=999999-").statusCode()).isEqualTo(404);
    }
    assertThat(v.owner().get("/api/v1/videos/" + v.id()).statusCode()).isEqualTo(200);
  }

  @Test
  void aVideoThatDoesNotExistIsNotFound() throws Exception {
    var v = mp4();
    var missing = "00000000-0000-4000-8000-000000000000";

    assertThat(v.owner().get("/api/v1/videos/" + missing).statusCode()).isEqualTo(404);
    assertThat(v.owner().getBytes("/api/v1/videos/" + missing + "/stream").statusCode())
        .isEqualTo(404);
    assertThat(v.owner().getBytes("/api/v1/videos/" + missing + "/download").statusCode())
        .isEqualTo(404);
  }

  @Test
  void signedOutRequestsAreRejectedLikeOtherApiRoutes() throws Exception {
    var v = mp4();
    var anonymous = new Session(port);

    assertThat(anonymous.get("/api/v1/videos/" + v.id()).statusCode()).isEqualTo(401);
    assertThat(anonymous.getBytes(v.stream()).statusCode()).isEqualTo(401);
    assertThat(anonymous.getBytes(v.download()).statusCode()).isEqualTo(401);
  }

  @Test
  void aFileMissingFromTheStoreIsACleanNotFoundNotATornStream() throws Exception {
    var v = mp4();
    var key =
        jdbc.queryForObject(
            "select object_key from video where id = ?::uuid", String.class, v.id());
    s3.deleteObject(b -> b.bucket(bucket).key(key));

    var stream = v.owner().get(v.stream());
    var download = v.owner().get(v.download());

    assertThat(stream.statusCode()).isEqualTo(404);
    assertThat(stream.headers().firstValue("Content-Type").orElse("")).contains("problem+json");
    assertThat(download.statusCode()).isEqualTo(404);
  }

  private static String sha256(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
}
