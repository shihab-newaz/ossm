package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** The vault from the outside: uploads in, a private list out, the originals in the store. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class VideoVaultTest {

  private static final ObjectMapper JSON = new ObjectMapper();

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired S3Client s3;

  @Value("${ossm.storage.bucket}")
  String bucket;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  private Session loggedInAdmin() throws Exception {
    var admin = new Session(port);
    assertThat(admin.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    return admin;
  }

  private Session memberOf(Session admin, String username) throws Exception {
    var invite =
        admin.post("/api/v1/users", "{\"username\":\"%s\",\"role\":\"USER\"}".formatted(username));
    var token = StoreClient.first(invite.body(), "\"token\":\"([^\"]+)\"");
    var member = new Session(port);
    member.post(
        "/api/v1/invites/" + token + "/accept", "{\"password\":\"a long enough password\"}");
    return member;
  }

  private JsonNode vault(Session session, String query) throws Exception {
    var response = session.get("/api/v1/videos" + query);
    assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    return JSON.readTree(response.body());
  }

  private boolean inStore(String key) {
    try {
      s3.headObject(b -> b.bucket(bucket).key(key));
      return true;
    } catch (NoSuchKeyException e) {
      return false;
    }
  }

  private String keyOf(String uploadId) {
    return jdbc.queryForObject(
        "select object_key from upload where id = ?::uuid", String.class, uploadId);
  }

  /** Object removal is a background job, so give it a moment instead of asserting at once. */
  private void awaitGone(String key) throws Exception {
    var deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (inStore(key)) {
      assertThat(System.nanoTime()).as("object %s was never removed", key).isLessThan(deadline);
      Thread.sleep(250);
    }
  }

  @Test
  void anMp4GoesFromBrowserToStoreToTheVaultUntouched() throws Exception {
    var user = loggedInAdmin();
    var mp4 = VideoFixture.mp4(1);

    var id = StoreClient.uploadVideo(user, "Beach Day.mp4", mp4);

    var finished = StoreClient.awaitFinished(user, id);
    assertThat(finished).contains("\"status\":\"DONE\"").contains("\"videoId\":\"" + id + "\"");
    var items = vault(user, "").get("items");
    assertThat(items).hasSize(1);
    var video = items.get(0);
    assertThat(video.get("id").asString()).isEqualTo(id);
    assertThat(video.get("title").asString()).isEqualTo("Beach Day");
    assertThat(video.get("originalFilename").asString()).isEqualTo("Beach Day.mp4");
    assertThat(video.get("container").asString()).isEqualTo("MP4");
    assertThat(video.get("sizeBytes").asLong()).isEqualTo(mp4.length);
    assertThat(video.get("description").asString()).isEmpty();

    // The original sits in its owner's folder, byte for byte as it was uploaded.
    var ownerId =
        jdbc.queryForObject("select id from users where username = 'admin'", String.class);
    var key = "video/%s/%s/original.mp4".formatted(ownerId, id);
    assertThat(keyOf(id)).isEqualTo(key);
    assertThat(s3.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray()).isEqualTo(mp4);
    // A video upload never becomes a track.
    assertThat(user.get("/api/v1/tracks").body()).isEqualTo("[]");
  }

  @Test
  void theContainerComesFromTheBytesNotTheFileName() throws Exception {
    var user = loggedInAdmin();

    var webm = StoreClient.uploadVideo(user, "clip.mkv", VideoFixture.webm(2));

    assertThat(StoreClient.awaitFinished(user, webm)).contains("\"status\":\"DONE\"");
    assertThat(vault(user, "").get("items").get(0).get("container").asString()).isEqualTo("WEBM");
  }

  @Test
  void aFileWithAVideoNameButOtherBytesFailsWithAReadableReasonAndCanBeRetried() throws Exception {
    var user = loggedInAdmin();

    var id = StoreClient.uploadVideo(user, "holiday.mp4", VideoFixture.notAVideo());

    var finished = StoreClient.awaitFinished(user, id);
    assertThat(finished).contains("\"status\":\"FAILED\"").contains("supported video file");
    assertThat(vault(user, "").get("items")).isEmpty();

    // Retry works as it does for audio: the upload goes back in the queue, and here the bytes are
    // still not a video, so it fails again for the same reason.
    var retry = user.post("/api/v1/uploads/" + id + "/retry", "");
    assertThat(retry.statusCode()).isEqualTo(202);
    assertThat(retry.body()).contains("\"status\":\"INGESTING\"");
    assertThat(StoreClient.awaitFinished(user, id))
        .contains("\"status\":\"FAILED\"")
        .contains("supported video file");
  }

  @Test
  void anAudioFileSentAsVideoIsNotAVideo() throws Exception {
    var user = loggedInAdmin();
    var mp3 = Mp3Fixture.mp3(Mp3Fixture.Tags.none());

    var id = StoreClient.uploadVideo(user, "song.mp4", mp3);

    assertThat(StoreClient.awaitFinished(user, id)).contains("\"status\":\"FAILED\"");
  }

  @Test
  void theSameBytesTwiceInOneVaultAreADuplicateAndTheSecondCopyIsRemoved() throws Exception {
    var user = loggedInAdmin();
    var mp4 = VideoFixture.mp4(3);
    var first = StoreClient.uploadVideo(user, "original.mp4", mp4);
    assertThat(StoreClient.awaitFinished(user, first)).contains("\"status\":\"DONE\"");

    var second = StoreClient.uploadVideo(user, "copy of original.mp4", mp4);

    var finished = StoreClient.awaitFinished(user, second);
    assertThat(finished)
        .contains("\"status\":\"DUPLICATE\"")
        .contains("\"videoId\":\"" + first + "\"");
    assertThat(vault(user, "").get("items")).hasSize(1);
    // The extra copy is removed by the object-deletion job; the first one stays.
    awaitGone(keyOf(second));
    assertThat(inStore(keyOf(first))).isTrue();
  }

  @Test
  void theSameBytesFromAnotherUserBecomeTheirOwnVideo() throws Exception {
    var admin = loggedInAdmin();
    var grace = memberOf(admin, "grace");
    var mp4 = VideoFixture.mp4(4);

    var mine = StoreClient.uploadVideo(admin, "mine.mp4", mp4);
    var hers = StoreClient.uploadVideo(grace, "hers.mp4", mp4);

    assertThat(StoreClient.awaitFinished(admin, mine)).contains("\"status\":\"DONE\"");
    assertThat(StoreClient.awaitFinished(grace, hers)).contains("\"status\":\"DONE\"");
    assertThat(vault(admin, "").get("items")).hasSize(1);
    assertThat(vault(grace, "").get("items")).hasSize(1);
    assertThat(inStore(keyOf(mine))).isTrue();
    assertThat(inStore(keyOf(hers))).isTrue();
    assertThat(jdbc.queryForObject("select count(*) from video", Integer.class)).isEqualTo(2);
  }

  @Test
  void aVaultIsPrivateToItsOwnerAdminsIncluded() throws Exception {
    var admin = loggedInAdmin();
    var grace = memberOf(admin, "grace");
    var hers = StoreClient.uploadVideo(grace, "private.mp4", VideoFixture.mp4(5));
    var mine = StoreClient.uploadVideo(admin, "mine.mp4", VideoFixture.mp4(6));
    StoreClient.awaitFinished(grace, hers);
    StoreClient.awaitFinished(admin, mine);

    var adminSees = vault(admin, "").toString();
    var graceSees = vault(grace, "").toString();

    assertThat(adminSees).contains("mine.mp4").doesNotContain("private.mp4");
    assertThat(graceSees).contains("private.mp4").doesNotContain("mine.mp4");
    // Nor does the upload itself show through.
    assertThat(admin.get("/api/v1/uploads/" + hers).statusCode()).isEqualTo(404);
  }

  @Test
  void adminsDoNotSeeVideoUploadFailuresInTheFailureList() throws Exception {
    var admin = loggedInAdmin();
    var grace = memberOf(admin, "grace");
    var secret = StoreClient.uploadVideo(grace, "secret-clip.mp4", VideoFixture.notAVideo());
    StoreClient.awaitFinished(grace, secret);
    var song = StoreClient.upload(grace, "broken-song.mp3", "not audio".repeat(60).getBytes());
    StoreClient.awaitFinished(grace, song);

    var failures = admin.get("/api/v1/admin/ingest-failures");

    assertThat(failures.statusCode()).isEqualTo(200);
    assertThat(failures.body()).contains("broken-song.mp3").doesNotContain("secret-clip");
  }

  @Test
  void theVaultNeedsALogin() throws Exception {
    assertThat(new Session(port).get("/api/v1/videos").statusCode()).isEqualTo(401);
  }

  @Test
  void theVaultPagesByCursorNewestFirstWithAStableOrderWhenTimestampsTie() throws Exception {
    var user = loggedInAdmin();
    var ids = new ArrayList<String>();
    for (int n = 0; n < 5; n++) {
      ids.add(StoreClient.uploadVideo(user, "clip " + n + ".mp4", VideoFixture.mp4(100 + n)));
    }
    for (var id : ids) {
      assertThat(StoreClient.awaitFinished(user, id)).contains("\"status\":\"DONE\"");
    }
    // Three share one instant (the ties), one is older, one is newer than all of them.
    jdbc.update("update video set created_at = '2026-01-02 10:00:00+00' where title = 'clip 0'");
    jdbc.update(
        "update video set created_at = '2026-01-02 11:00:00.123456+00'"
            + " where title in ('clip 1', 'clip 2', 'clip 3')");
    jdbc.update("update video set created_at = '2026-01-02 12:00:00+00' where title = 'clip 4'");
    var expected =
        jdbc.queryForList(
            "select id::text from video order by created_at desc, id desc", String.class);

    var seen = new ArrayList<String>();
    String cursor = null;
    int pages = 0;
    do {
      var page = vault(user, "?limit=2" + (cursor == null ? "" : "&cursor=" + cursor));
      page.get("items").forEach(item -> seen.add(item.get("id").asString()));
      cursor = page.has("nextCursor") ? page.get("nextCursor").asString() : null;
      pages++;
    } while (cursor != null && pages < 10);

    assertThat(pages).isEqualTo(3);
    assertThat(seen).containsExactlyElementsOf(expected);
    assertThat(seen).doesNotHaveDuplicates().hasSize(5);
    assertThat(seen.get(0)).isEqualTo(ids.get(4));
    assertThat(seen.get(4)).isEqualTo(ids.get(0));
  }

  @Test
  void aVideoUploadedWhileReadingIsNotRepeatedOrSkipped() throws Exception {
    var user = loggedInAdmin();
    for (int n = 0; n < 3; n++) {
      var id = StoreClient.uploadVideo(user, "early " + n + ".mp4", VideoFixture.mp4(200 + n));
      StoreClient.awaitFinished(user, id);
    }
    var first = vault(user, "?limit=2");
    var cursor = first.get("nextCursor").asString();

    var late = StoreClient.uploadVideo(user, "late.mp4", VideoFixture.mp4(299));
    StoreClient.awaitFinished(user, late);
    var second = vault(user, "?limit=2&cursor=" + cursor);

    var seen = new ArrayList<String>();
    first.get("items").forEach(item -> seen.add(item.get("id").asString()));
    second.get("items").forEach(item -> seen.add(item.get("id").asString()));
    assertThat(seen).doesNotHaveDuplicates().hasSize(3).doesNotContain(late);
  }

  @Test
  void badPagingParametersAreRefused() throws Exception {
    var user = loggedInAdmin();

    for (var query : List.of("?limit=0", "?limit=201", "?cursor=not-a-cursor", "?cursor=")) {
      assertThat(user.get("/api/v1/videos" + query).statusCode()).as(query).isEqualTo(400);
    }
  }
}
