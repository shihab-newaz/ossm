package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

/** Liking tracks: per user, idempotent, newest like first. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class FavoritesApiTest {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String PASSWORD = "another long passphrase";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private Session admin;
  private UUID uploader;

  @BeforeEach
  void freshInstance() throws Exception {
    AuthTestSupport.resetInstance(jdbc);
    admin = new Session(port);
    assertThat(admin.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    uploader = jdbc.queryForObject("select id from users", UUID.class);
  }

  private Session member(String username) throws Exception {
    var invite =
        admin.post("/api/v1/users", "{\"username\":\"%s\",\"role\":\"USER\"}".formatted(username));
    var token = JSON.readTree(invite.body()).get("token").asString();
    var browser = new Session(port);
    var accepted =
        browser.post("/api/v1/invites/" + token + "/accept", "{\"password\":\"" + PASSWORD + "\"}");
    assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(201);
    return browser;
  }

  private UUID track(String title) {
    var artist = UUID.randomUUID();
    jdbc.update(
        "insert into artist (id, name, name_key) values (?, 'Band', ?)", artist, artist.toString());
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into track (id, title, artist_id, duration_ms, object_key, size_bytes, uploader_id)"
            + " values (?, ?, ?, 1000, ?, 1, ?)",
        id,
        title,
        artist,
        "audio/" + id + ".mp3",
        uploader);
    return id;
  }

  private static HttpResponse<String> send(String method, String path, int port, String cookie)
      throws Exception {
    return HttpClient.newHttpClient()
        .send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Cookie", "OSSM_SESSION=" + cookie)
                .method(method, HttpRequest.BodyPublishers.noBody())
                .build(),
            HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> put(Session who, UUID track) throws Exception {
    return send("PUT", "/api/v1/favorites/" + track, port, who.sessionCookie());
  }

  private HttpResponse<String> delete(Session who, UUID track) throws Exception {
    return send("DELETE", "/api/v1/favorites/" + track, port, who.sessionCookie());
  }

  private List<String> likedTitles(Session who) throws Exception {
    var response = who.get("/api/v1/favorites");
    assertThat(response.statusCode()).isEqualTo(200);
    var out = new ArrayList<String>();
    JSON.readTree(response.body()).forEach(t -> out.add(t.get("title").asString()));
    return out;
  }

  private List<String> likedIds(Session who) throws Exception {
    var response = who.get("/api/v1/favorites/ids");
    assertThat(response.statusCode()).isEqualTo(200);
    var out = new ArrayList<String>();
    JSON.readTree(response.body()).forEach(id -> out.add(id.asString()));
    return out;
  }

  @Test
  void aLikedTrackIsListedAndUnlikingRemovesIt() throws Exception {
    var song = track("Song");
    track("Other");

    assertThat(put(admin, song).statusCode()).isEqualTo(204);

    assertThat(likedTitles(admin)).containsExactly("Song");
    assertThat(likedIds(admin)).containsExactly(song.toString());

    assertThat(delete(admin, song).statusCode()).isEqualTo(204);
    assertThat(likedTitles(admin)).isEmpty();
    assertThat(likedIds(admin)).isEmpty();
  }

  @Test
  void likesSurviveSigningInAgain() throws Exception {
    var song = track("Song");
    put(admin, song);

    var later = new Session(port);
    assertThat(later.post("/api/v1/auth/login", ADMIN_SETUP).statusCode()).isEqualTo(200);

    assertThat(likedTitles(later)).containsExactly("Song");
  }

  @Test
  void likingTwiceOrUnlikingWhatIsNotLikedChangesNothing() throws Exception {
    var song = track("Song");

    assertThat(delete(admin, song).statusCode()).isEqualTo(204);
    assertThat(put(admin, song).statusCode()).isEqualTo(204);
    assertThat(put(admin, song).statusCode()).isEqualTo(204);

    assertThat(likedIds(admin)).containsExactly(song.toString());
    assertThat(jdbc.queryForObject("select count(*) from favorite", Integer.class)).isEqualTo(1);
  }

  @Test
  void theMostRecentLikeComesFirstAndPagesTileWithTheTotalReported() throws Exception {
    var songs = new ArrayList<UUID>();
    for (int i = 1; i <= 5; i++) {
      songs.add(track("Song " + i));
    }
    for (var song : songs) {
      assertThat(put(admin, song).statusCode()).isEqualTo(204);
    }

    assertThat(likedTitles(admin))
        .containsExactly("Song 5", "Song 4", "Song 3", "Song 2", "Song 1");

    var first = admin.get("/api/v1/favorites?limit=2&offset=0");
    var second = admin.get("/api/v1/favorites?limit=2&offset=2");
    var third = admin.get("/api/v1/favorites?limit=2&offset=4");
    assertThat(first.headers().firstValue("X-Total-Count")).contains("5");
    var titles = new ArrayList<String>();
    for (var page : List.of(first, second, third)) {
      JSON.readTree(page.body()).forEach(t -> titles.add(t.get("title").asString()));
    }
    assertThat(titles).containsExactly("Song 5", "Song 4", "Song 3", "Song 2", "Song 1");
  }

  @Test
  void relikingMovesATrackBackToTheFront() throws Exception {
    var a = track("A");
    var b = track("B");
    put(admin, a);
    put(admin, b);
    delete(admin, a);
    put(admin, a);

    assertThat(likedTitles(admin)).containsExactly("A", "B");
  }

  @Test
  void favoritesBelongToTheirUserAlone() throws Exception {
    var grace = member("grace");
    var song = track("Song");
    var shared = track("Shared");
    put(admin, song);
    put(admin, shared);

    assertThat(likedTitles(grace)).isEmpty();
    assertThat(likedIds(grace)).isEmpty();

    // Her likes do not touch his, and unliking is her own business too.
    assertThat(put(grace, shared).statusCode()).isEqualTo(204);
    assertThat(likedTitles(grace)).containsExactly("Shared");
    assertThat(delete(grace, shared).statusCode()).isEqualTo(204);
    assertThat(likedTitles(admin)).containsExactlyInAnyOrder("Song", "Shared");
  }

  @Test
  void likingATrackThatDoesNotExistIsNotFound() throws Exception {
    assertThat(put(admin, UUID.randomUUID()).statusCode()).isEqualTo(404);
    assertThat(jdbc.queryForObject("select count(*) from favorite", Integer.class)).isZero();
  }

  @Test
  void everyFavoritesRouteNeedsALogin() throws Exception {
    var anonymous = new Session(port);
    var song = track("Song");

    assertThat(anonymous.get("/api/v1/favorites").statusCode()).isEqualTo(401);
    assertThat(anonymous.get("/api/v1/favorites/ids").statusCode()).isEqualTo(401);
    assertThat(send("PUT", "/api/v1/favorites/" + song, port, "none").statusCode()).isEqualTo(401);
    assertThat(send("DELETE", "/api/v1/favorites/" + song, port, "none").statusCode())
        .isEqualTo(401);
  }

  @Test
  void deletingATrackDropsItsLikes() throws Exception {
    var song = track("Song");
    put(admin, song);

    jdbc.update("delete from track where id = ?", song);

    assertThat(likedIds(admin)).isEmpty();
  }
}
