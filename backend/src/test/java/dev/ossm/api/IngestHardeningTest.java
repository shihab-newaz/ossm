package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ossm.api.Mp3Fixture.Tags;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class IngestHardeningTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired S3Client s3;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  private Session admin() throws Exception {
    var admin = new Session(port);
    assertThat(admin.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    return admin;
  }

  private Session member(Session admin, String username) throws Exception {
    var invite =
        admin.post("/api/v1/users", "{\"username\":\"%s\",\"role\":\"USER\"}".formatted(username));
    var member = new Session(port);
    member.post(
        "/api/v1/invites/" + StoreClient.first(invite.body(), "\"token\":\"([^\"]+)\"") + "/accept",
        "{\"password\":\"a long enough password\"}");
    return member;
  }

  private static byte[] fixture(String name) throws IOException {
    return Files.readAllBytes(Path.of("src", "test", "resources", "audio", name));
  }

  private static byte[] orangePng() throws IOException {
    var image = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB);
    var g = image.createGraphics();
    g.setColor(new Color(0xE8, 0x64, 0x2C));
    g.fillRect(0, 0, 32, 32);
    g.dispose();
    var out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    return out.toByteArray();
  }

  @ParameterizedTest
  @CsvSource({
    "tone.flac,flac,true",
    "tone.m4a,aac,true",
    "tone.ogg,vorbis,false",
    "tone.opus,opus,false",
    "tone.wav,wav,false"
  })
  void everySupportedFormatIngestsWithItsMetadata(String file, String codec, boolean hasCover)
      throws Exception {
    var user = admin();

    var id = StoreClient.upload(user, file, fixture(file));

    assertThat(StoreClient.awaitFinished(user, id)).contains("\"status\":\"DONE\"");
    var track = user.get("/api/v1/tracks").body();
    assertThat(track)
        .contains("\"title\":\"ToneTitle\"")
        .contains("\"artist\":\"ToneArtist\"")
        .contains("\"album\":\"ToneAlbum\"")
        .contains("\"year\":2020")
        .contains("\"genre\":\"Test\"")
        .contains("\"codec\":\"" + codec + "\"");
    var duration = Long.parseLong(StoreClient.first(track, "\"durationMs\":(\\d+)"));
    assertThat(duration).isBetween(1_800L, 2_300L);
    assertThat(track.contains("coverUrl")).isEqualTo(hasCover);
    assertThat(track.contains("dominantColor")).isEqualTo(hasCover);
  }

  @Test
  void theFileIsJudgedByItsBytesNotItsName() throws Exception {
    var user = admin();

    var id = StoreClient.upload(user, "really-a-flac.mp3", fixture("tone.flac"));

    assertThat(StoreClient.awaitFinished(user, id)).contains("\"status\":\"DONE\"");
    assertThat(user.get("/api/v1/tracks").body()).contains("\"codec\":\"flac\"");
  }

  @Test
  void unsupportedFilesAreRejectedWithAReadableReason() throws Exception {
    var user = admin();
    var webm =
        new byte[] {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    var png = Mp3Fixture.PNG;

    var renamedText =
        StoreClient.upload(user, "notes.mp3", "plain words, not audio ".repeat(40).getBytes());
    var renamedWebm = StoreClient.upload(user, "clip.mp3", webm);
    var renamedPng = StoreClient.upload(user, "cover.flac", png);

    for (var id : new String[] {renamedText, renamedWebm, renamedPng}) {
      var finished = StoreClient.awaitFinished(user, id);
      assertThat(finished)
          .contains("\"status\":\"FAILED\"")
          .contains("MP3, FLAC, M4A, OGG/Opus and WAV");
    }
    assertThat(user.get("/api/v1/tracks").body()).isEqualTo("[]");
  }

  @Test
  void aTruncatedAudioFileFailsInsteadOfAddingAHalfTrack() throws Exception {
    var user = admin();
    var flac = fixture("tone.flac");

    var id = StoreClient.upload(user, "cut-off.flac", java.util.Arrays.copyOf(flac, 40));

    assertThat(StoreClient.awaitFinished(user, id)).contains("\"status\":\"FAILED\"");
    assertThat(user.get("/api/v1/tracks").body()).isEqualTo("[]");
  }

  @Test
  void uploadingTheSameFileTwiceLeavesOneTrack() throws Exception {
    var user = admin();
    var mp3 = Mp3Fixture.mp3(new Tags("Same Song", "Band", null, null, null, null, null));

    var first = StoreClient.upload(user, "first.mp3", mp3);
    var firstDone = StoreClient.awaitFinished(user, first);
    var second = StoreClient.upload(user, "copy-of-first.mp3", mp3);
    var secondDone = StoreClient.awaitFinished(user, second);

    assertThat(firstDone).contains("\"status\":\"DONE\"");
    assertThat(secondDone).contains("\"status\":\"DUPLICATE\"");
    assertThat(StoreClient.first(secondDone, "\"trackId\":\"([^\"]+)\""))
        .isEqualTo(StoreClient.first(firstDone, "\"trackId\":\"([^\"]+)\""));
    assertThat(jdbc.queryForObject("select count(*) from track", Integer.class)).isEqualTo(1);

    // The extra copy is not kept in the store.
    var duplicateKey =
        jdbc.queryForObject(
            "select object_key from upload where id = ?::uuid", String.class, second);
    assertThatThrownBy(() -> s3.headObject(b -> b.bucket("ossm").key(duplicateKey)))
        .isInstanceOf(NoSuchKeyException.class);
  }

  @Test
  void aDifferentFileWithTheSameTagsIsNotADuplicate() throws Exception {
    var user = admin();
    var tags = new Tags("Same Tags", "Band", null, null, null, null, null);

    StoreClient.awaitFinished(user, StoreClient.upload(user, "a.mp3", Mp3Fixture.mp3(tags, 200)));
    var other =
        StoreClient.awaitFinished(
            user, StoreClient.upload(user, "b.mp3", Mp3Fixture.mp3(tags, 150)));

    assertThat(other).contains("\"status\":\"DONE\"");
    assertThat(jdbc.queryForObject("select count(*) from track", Integer.class)).isEqualTo(2);
  }

  @Test
  void theLicenseDefaultsAndCanBeChosenAtUpload() throws Exception {
    var user = admin();
    var plain =
        Mp3Fixture.mp3(new Tags("Default Licence", "Band", null, null, null, null, null), 180);
    var open = Mp3Fixture.mp3(new Tags("Open Licence", "Band", null, null, null, null, null), 190);

    StoreClient.awaitFinished(user, StoreClient.upload(user, "plain.mp3", plain));
    StoreClient.awaitFinished(user, StoreClient.upload(user, "open.mp3", open, "CC BY"));

    var tracks = user.get("/api/v1/tracks").body();
    assertThat(tracks)
        .containsPattern(
            "\"title\":\"Default Licence\"[^}]*\"license\":\"All rights reserved\""
                .replace("[^}]*", ".*?"));
    assertThat(
            jdbc.queryForObject(
                "select license from track where title = 'Open Licence'", String.class))
        .isEqualTo("CC BY");
    assertThat(
            jdbc.queryForObject(
                "select license from track where title = 'Default Licence'", String.class))
        .isEqualTo("All rights reserved");
  }

  @Test
  void anUnknownLicenseIsRefused() throws Exception {
    var response =
        admin()
            .post(
                "/api/v1/uploads",
                "{\"filename\":\"x.mp3\",\"sizeBytes\":10,\"license\":\"Do whatever\"}");

    assertThat(response.statusCode()).isEqualTo(400);
    assertThat(response.body()).contains("Choose one of the listed licenses");
    assertThat(jdbc.queryForObject("select count(*) from upload", Integer.class)).isZero();
  }

  @Test
  void theAlbumsDominantColorComesFromItsCover() throws Exception {
    var user = admin();
    var mp3 =
        Mp3Fixture.mp3(new Tags("Coloured", "Band", "Orange Album", null, 1, 2020, orangePng()));

    StoreClient.awaitFinished(user, StoreClient.upload(user, "coloured.mp3", mp3));

    assertThat(user.get("/api/v1/tracks").body()).contains("\"dominantColor\":\"#e8642c\"");
  }

  @Test
  void aCoverThatCannotBeDecodedStillIngestsWithoutAColor() throws Exception {
    var user = admin();
    var junkCover = "this is not really an image".repeat(5).getBytes();
    var mp3 = Mp3Fixture.mp3(new Tags("Odd Cover", "Band", "Odd Album", null, 1, 2020, junkCover));

    var finished = StoreClient.awaitFinished(user, StoreClient.upload(user, "odd.mp3", mp3));

    assertThat(finished).contains("\"status\":\"DONE\"");
    assertThat(user.get("/api/v1/tracks").body()).doesNotContain("dominantColor");
  }

  @Test
  void onlyFailedUploadsOfYoursCanBeRetried() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var done = StoreClient.upload(grace, "fine.mp3", Mp3Fixture.mp3(Tags.none()));
    StoreClient.awaitFinished(grace, done);

    assertThat(grace.post("/api/v1/uploads/" + done + "/retry", "").statusCode()).isEqualTo(409);
    assertThat(admin.post("/api/v1/uploads/" + done + "/retry", "").statusCode()).isEqualTo(404);
    assertThat(
            grace
                .post("/api/v1/uploads/00000000-0000-0000-0000-000000000000/retry", "")
                .statusCode())
        .isEqualTo(404);
    assertThat(new Session(port).post("/api/v1/uploads/" + done + "/retry", "").statusCode())
        .isEqualTo(401);
  }

  @Test
  void adminsSeeEveryonesIngestFailuresAndOthersDoNot() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var failed = StoreClient.upload(grace, "broken.mp3", "not audio at all ".repeat(30).getBytes());
    StoreClient.awaitFinished(grace, failed);

    var listed = admin.get("/api/v1/admin/ingest-failures");

    assertThat(listed.statusCode()).isEqualTo(200);
    assertThat(listed.body())
        .contains("\"filename\":\"broken.mp3\"")
        .contains("\"username\":\"grace\"")
        .contains("MP3, FLAC, M4A, OGG/Opus and WAV")
        .contains(failed);
    assertThat(grace.get("/api/v1/admin/ingest-failures").statusCode()).isEqualTo(403);
    assertThat(new Session(port).get("/api/v1/admin/ingest-failures").statusCode()).isEqualTo(401);
  }
}
