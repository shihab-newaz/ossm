package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import dev.ossm.api.Mp3Fixture.Tags;
import java.net.URI;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class IngestFlowTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  @Value("${ossm.storage.endpoint}")
  String storeEndpoint;

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

  @Test
  void anMp3GoesFromBrowserToStoreToLibraryWithItsTagsAndCover() throws Exception {
    var user = loggedInAdmin();
    var mp3 =
        Mp3Fixture.mp3(
            new Tags(
                "Midnight City", "M83", "Hurry Up, We're Dreaming", null, 3, 2011, Mp3Fixture.PNG));

    var started = StoreClient.start(user, "Midnight City.mp3", mp3.length);

    // The bytes go to the object store, not to the API.
    var store = URI.create(storeEndpoint);
    var partUrl = URI.create(started.partUrls().get(0));
    assertThat(partUrl.getHost()).isEqualTo(store.getHost());
    assertThat(partUrl.getPort()).isEqualTo(store.getPort()).isNotEqualTo(port);

    var complete =
        user.post(
            "/api/v1/uploads/" + started.uploadId() + "/complete",
            StoreClient.putParts(started, mp3));
    assertThat(complete.statusCode()).isEqualTo(202);
    assertThat(complete.body()).containsPattern("\"status\":\"(INGESTING|DONE)\"");

    var finished = StoreClient.awaitFinished(user, started.uploadId());
    assertThat(finished).contains("\"status\":\"DONE\"").contains("\"trackId\"");

    var tracks = user.get("/api/v1/tracks");
    assertThat(tracks.statusCode()).isEqualTo(200);
    assertThat(tracks.body())
        .contains("\"title\":\"Midnight City\"")
        .contains("\"artist\":\"M83\"")
        .contains("\"album\":\"Hurry Up, We're Dreaming\"")
        .contains("\"trackNumber\":3")
        .contains("\"year\":2011")
        .contains("\"codec\":\"mp3\"")
        .contains("\"bitrateKbps\":128");
    var duration = Long.parseLong(StoreClient.first(tracks.body(), "\"durationMs\":(\\d+)"));
    assertThat(duration).isBetween(4_500L, 6_000L);

    var coverUrl = StoreClient.first(tracks.body(), "\"coverUrl\":\"([^\"]+)\"");
    var cover = user.getBytes(coverUrl);
    assertThat(cover.statusCode()).isEqualTo(200);
    assertThat(cover.headers().firstValue("Content-Type").orElse("")).isEqualTo("image/png");
    assertThat(cover.body()).isEqualTo(Mp3Fixture.PNG);
  }

  @Test
  void tracksShareArtistAndAlbumRows() throws Exception {
    var user = loggedInAdmin();
    for (var n : new int[] {1, 2}) {
      var mp3 =
          Mp3Fixture.mp3(
              new Tags(
                  "Song " + n,
                  "  Daft  Punk ",
                  "Discovery",
                  null,
                  n,
                  2001,
                  n == 1 ? Mp3Fixture.PNG : null));
      StoreClient.awaitFinished(user, StoreClient.upload(user, "song" + n + ".mp3", mp3));
    }

    assertThat(jdbc.queryForObject("select count(*) from artist", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from album", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from track", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject("select name from artist", String.class))
        .isEqualTo("Daft  Punk");
    // The album got its cover from the first track and keeps it.
    assertThat(
            jdbc.queryForObject(
                "select count(*) from album where cover_key is not null", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void aFileWithNoTagsFallsBackToItsFilenameAndUnknownArtist() throws Exception {
    var user = loggedInAdmin();

    var id = StoreClient.upload(user, "Untagged Demo.mp3", Mp3Fixture.mp3(Tags.none()));

    assertThat(StoreClient.awaitFinished(user, id)).contains("\"status\":\"DONE\"");
    var tracks = user.get("/api/v1/tracks").body();
    assertThat(tracks)
        .contains("\"title\":\"Untagged Demo\"")
        .contains("\"artist\":\"Unknown Artist\"");
    assertThat(tracks).doesNotContain("\"album\"").doesNotContain("coverUrl");
  }

  @Test
  void aFileThatIsNotAudioFailsWithAReadableReason() throws Exception {
    var user = loggedInAdmin();

    var id =
        StoreClient.upload(user, "notes.mp3", "this is just text, not audio".repeat(50).getBytes());

    var finished = StoreClient.awaitFinished(user, id);
    assertThat(finished).contains("\"status\":\"FAILED\"").contains("supported audio file");
    assertThat(user.get("/api/v1/tracks").body()).isEqualTo("[]");
  }

  @Test
  void everyUploadEndpointNeedsALogin() throws Exception {
    var anonymous = new Session(port);
    var id = "00000000-0000-0000-0000-000000000000";

    assertThat(
            anonymous
                .post("/api/v1/uploads", "{\"filename\":\"a.mp3\",\"sizeBytes\":10}")
                .statusCode())
        .isEqualTo(401);
    assertThat(anonymous.get("/api/v1/uploads").statusCode()).isEqualTo(401);
    assertThat(anonymous.get("/api/v1/uploads/" + id).statusCode()).isEqualTo(401);
    assertThat(
            anonymous
                .post(
                    "/api/v1/uploads/" + id + "/complete",
                    "{\"parts\":[{\"partNumber\":1,\"etag\":\"x\"}]}")
                .statusCode())
        .isEqualTo(401);
    assertThat(anonymous.get("/api/v1/tracks").statusCode()).isEqualTo(401);
    assertThat(anonymous.get("/api/v1/albums/" + id + "/cover").statusCode()).isEqualTo(401);
  }

  @Test
  void youOnlySeeAndCompleteYourOwnUploads() throws Exception {
    var admin = loggedInAdmin();
    var grace = memberOf(admin, "grace");
    var mp3 = Mp3Fixture.mp3(Tags.none());
    var started = StoreClient.start(grace, "mine.mp3", mp3.length);
    var parts = StoreClient.putParts(started, mp3);

    assertThat(admin.get("/api/v1/uploads/" + started.uploadId()).statusCode()).isEqualTo(404);
    assertThat(admin.get("/api/v1/uploads").body()).isEqualTo("[]");
    assertThat(
            admin.post("/api/v1/uploads/" + started.uploadId() + "/complete", parts).statusCode())
        .isEqualTo(404);
    assertThat(grace.get("/api/v1/uploads").body()).contains(started.uploadId());
  }

  @Test
  void theSharedLibraryIsVisibleToEveryUser() throws Exception {
    var admin = loggedInAdmin();
    var grace = memberOf(admin, "grace");
    StoreClient.awaitFinished(
        admin,
        StoreClient.upload(
            admin,
            "a.mp3",
            Mp3Fixture.mp3(new Tags("Shared Song", "Someone", null, null, null, null, null))));

    assertThat(grace.get("/api/v1/tracks").body()).contains("Shared Song");
  }

  @Test
  void oversizedFilesAreRefusedBeforeAnythingIsCreated() throws Exception {
    var user = loggedInAdmin();

    var tooBig = user.post("/api/v1/uploads", "{\"filename\":\"big.mp3\",\"sizeBytes\":262144001}");
    var empty = user.post("/api/v1/uploads", "{\"filename\":\"empty.mp3\",\"sizeBytes\":0}");
    var unnamed = user.post("/api/v1/uploads", "{\"filename\":\"\",\"sizeBytes\":10}");

    assertThat(tooBig.statusCode()).isEqualTo(400);
    assertThat(tooBig.body()).contains("at most 250 MB");
    assertThat(empty.statusCode()).isEqualTo(400);
    assertThat(unnamed.statusCode()).isEqualTo(400);
    assertThat(jdbc.queryForObject("select count(*) from upload", Integer.class)).isZero();
  }

  @Test
  void completingTwiceOrWithBadPartsIsRejected() throws Exception {
    var user = loggedInAdmin();
    var mp3 = Mp3Fixture.mp3(Tags.none());
    var started = StoreClient.start(user, "x.mp3", mp3.length);

    var bogus =
        user.post(
            "/api/v1/uploads/" + started.uploadId() + "/complete",
            "{\"parts\":[{\"partNumber\":1,\"etag\":\"\\\"nope\\\"\"}]}");
    assertThat(bogus.statusCode()).isEqualTo(400);

    var parts = StoreClient.putParts(started, mp3);
    assertThat(user.post("/api/v1/uploads/" + started.uploadId() + "/complete", parts).statusCode())
        .isEqualTo(202);
    assertThat(user.post("/api/v1/uploads/" + started.uploadId() + "/complete", parts).statusCode())
        .isEqualTo(409);
  }
}
