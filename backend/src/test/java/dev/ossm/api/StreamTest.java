package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import dev.ossm.api.Mp3Fixture.Tags;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class StreamTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  /** Uploads a real MP3 and returns the session, the track id and the exact bytes stored. */
  private record Uploaded(Session session, String trackId, byte[] bytes) {
    String stream() {
      return "/api/v1/tracks/" + trackId + "/stream";
    }
  }

  private Uploaded uploaded() throws Exception {
    var session = new Session(port);
    assertThat(session.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    var bytes = Mp3Fixture.mp3(new Tags("Stream Me", "Streamer", "Streams", null, 1, 2020, null));
    var uploadId = StoreClient.upload(session, "stream-me.mp3", bytes);
    var finished = StoreClient.awaitFinished(session, uploadId);
    assertThat(finished).contains("\"status\":\"DONE\"");
    return new Uploaded(session, StoreClient.first(finished, "\"trackId\":\"([^\"]+)\""), bytes);
  }

  private HttpResponse<byte[]> get(Uploaded u, String range) throws Exception {
    return range == null
        ? u.session().getBytes(u.stream())
        : u.session().getBytes(u.stream(), range);
  }

  @Test
  void aTrackStreamsInFullWithTheHeadersAPlayerNeeds() throws Exception {
    var u = uploaded();

    var response = get(u, null);

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).isEqualTo(u.bytes());
    assertThat(response.headers().firstValue("Content-Type")).contains("audio/mpeg");
    assertThat(response.headers().firstValue("Accept-Ranges")).contains("bytes");
    assertThat(response.headers().firstValue("Content-Length")).contains("" + u.bytes().length);
    assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("private");
  }

  @Test
  void aRangeFromTheStartReturnsOnlyThoseBytes() throws Exception {
    var u = uploaded();

    var response = get(u, "bytes=0-99");

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body()).isEqualTo(Arrays.copyOfRange(u.bytes(), 0, 100));
    assertThat(response.headers().firstValue("Content-Range"))
        .contains("bytes 0-99/" + u.bytes().length);
    assertThat(response.headers().firstValue("Content-Length")).contains("100");
  }

  @Test
  void aRangeFromTheMiddleSeeksWithoutTheStart() throws Exception {
    var u = uploaded();
    int from = u.bytes().length / 2;

    var response = get(u, "bytes=" + from + "-" + (from + 999));

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body()).isEqualTo(Arrays.copyOfRange(u.bytes(), from, from + 1000));
    assertThat(response.headers().firstValue("Content-Range"))
        .contains("bytes %d-%d/%d".formatted(from, from + 999, u.bytes().length));
  }

  @Test
  void anOpenEndedRangeRunsToTheEndOfTheFile() throws Exception {
    var u = uploaded();
    int from = u.bytes().length - 500;

    var response = get(u, "bytes=" + from + "-");

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body()).isEqualTo(Arrays.copyOfRange(u.bytes(), from, u.bytes().length));
    assertThat(response.headers().firstValue("Content-Range"))
        .contains("bytes %d-%d/%d".formatted(from, u.bytes().length - 1, u.bytes().length));
  }

  @Test
  void aSuffixRangeReturnsTheLastBytes() throws Exception {
    var u = uploaded();

    var response = get(u, "bytes=-128");

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body())
        .isEqualTo(Arrays.copyOfRange(u.bytes(), u.bytes().length - 128, u.bytes().length));
    assertThat(response.headers().firstValue("Content-Range"))
        .contains(
            "bytes %d-%d/%d"
                .formatted(u.bytes().length - 128, u.bytes().length - 1, u.bytes().length));
  }

  @Test
  void aRangeEndingPastTheFileIsClampedToItsEnd() throws Exception {
    var u = uploaded();
    int from = u.bytes().length - 10;

    var response = get(u, "bytes=" + from + "-" + (u.bytes().length + 5000));

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body()).hasSize(10);
  }

  @Test
  void aSuffixLongerThanTheFileReturnsTheWholeFileAsPartialContent() throws Exception {
    var u = uploaded();

    var response = get(u, "bytes=-" + (u.bytes().length + 1000));

    assertThat(response.statusCode()).isEqualTo(206);
    assertThat(response.body()).isEqualTo(u.bytes());
  }

  @Test
  void aRangeStartingPastTheFileIsNotSatisfiable() throws Exception {
    var u = uploaded();

    var response = get(u, "bytes=" + u.bytes().length + "-");

    assertThat(response.statusCode()).isEqualTo(416);
    assertThat(response.headers().firstValue("Content-Range"))
        .contains("bytes */" + u.bytes().length);
  }

  @Test
  void aMalformedOrUnsupportedRangeIsIgnoredAndTheWholeFileIsSent() throws Exception {
    var u = uploaded();

    for (var range : new String[] {"bytes=abc", "lines=0-5", "bytes=9-3"}) {
      var response = get(u, range);
      assertThat(response.statusCode()).as(range).isEqualTo(200);
      assertThat(response.body()).as(range).isEqualTo(u.bytes());
    }
  }

  @Test
  void severalRangesAtOnceFallBackToTheWholeFile() throws Exception {
    var u = uploaded();

    var response = get(u, "bytes=0-9,20-29");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).isEqualTo(u.bytes());
  }

  @Test
  void anUnknownTrackIsNotFound() throws Exception {
    var u = uploaded();

    var response = u.session().get("/api/v1/tracks/00000000-0000-0000-0000-000000000000/stream");

    assertThat(response.statusCode()).isEqualTo(404);
    assertThat(response.headers().firstValue("Content-Type").orElse(""))
        .contains("application/problem+json");
  }

  @Test
  void aTrackWhoseFileHasGoneMissingIsNotFoundRatherThanAServerError() throws Exception {
    var u = uploaded();
    jdbc.update("update track set object_key = 'audio/missing.mp3'");

    var response = u.session().get(u.stream());

    assertThat(response.statusCode()).isEqualTo(404);
  }

  @Test
  void streamingNeedsALogin() throws Exception {
    var u = uploaded();

    var anonymous =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + u.stream())).build(),
                HttpResponse.BodyHandlers.discarding());
    var cover =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(
                        URI.create(
                            "http://localhost:"
                                + port
                                + "/api/v1/albums/00000000-0000-0000-0000-000000000000/cover"))
                    .build(),
                HttpResponse.BodyHandlers.discarding());

    assertThat(anonymous.statusCode()).isEqualTo(401);
    assertThat(cover.statusCode()).isEqualTo(401);
  }
}
