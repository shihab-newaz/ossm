package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** The data behind Explore: genres, recently added, featured, and most played. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class ExploreApiTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private Session session;
  private UUID uploader;
  private UUID band;
  private final OffsetDateTime base = OffsetDateTime.parse("2026-01-01T00:00:00Z");

  @BeforeEach
  void freshInstance() throws Exception {
    AuthTestSupport.resetInstance(jdbc);
    session = new Session(port);
    assertThat(session.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    uploader = jdbc.queryForObject("select id from users", UUID.class);
    band = UUID.randomUUID();
    jdbc.update("insert into artist (id, name, name_key) values (?, 'Band', 'band')", band);
  }

  private UUID album(String title, boolean cover) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into album (id, title, title_key, artist_id, cover_key, dominant_color)"
            + " values (?, ?, ?, ?, ?, ?)",
        id,
        title,
        title.toLowerCase(),
        band,
        cover ? "covers/aa/" + id + ".jpg" : null,
        cover ? "#336699" : null);
    return id;
  }

  private UUID track(String title, UUID album, String genre, int ageDays) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into track (id, title, artist_id, album_id, genre, duration_ms, object_key,"
            + " size_bytes, uploader_id, created_at) values (?, ?, ?, ?, ?, 1000, ?, 1, ?, ?)",
        id,
        title,
        band,
        album,
        genre,
        "audio/" + id + ".mp3",
        uploader,
        base.minusDays(ageDays));
    return id;
  }

  private void play(UUID track, int times) {
    for (int i = 0; i < times; i++) {
      jdbc.update(
          "insert into play_event (event_id, schema_version, user_id, track_id, type, occurred_at,"
              + " position_ms, client_id) values (?, 1, ?, ?, 'play_completed', ?, 30000, 'test')",
          UUID.randomUUID(),
          uploader,
          track,
          Instant.now().atOffset(java.time.ZoneOffset.UTC));
    }
  }

  private static List<String> field(String json, String name) {
    var matcher = Pattern.compile("\"" + name + "\":\"([^\"]*)\"").matcher(json);
    var values = new ArrayList<String>();
    while (matcher.find()) {
      values.add(matcher.group(1));
    }
    return values;
  }

  @Test
  void genresComeFromTheTagsActuallyPresentWithCounts() throws Exception {
    var withCover = album("Covered", true);
    track("a", withCover, "Rock", 3);
    track("b", withCover, "Rock", 2);
    track("c", null, "Jazz", 1);
    track("no genre", null, null, 0);
    track("blank genre", null, "   ", 0);

    var response = session.get("/api/v1/genres");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(field(response.body(), "slug")).containsExactly("rock", "jazz");
    assertThat(response.body())
        .contains("\"name\":\"Rock\",\"slug\":\"rock\",\"trackCount\":2")
        .contains("\"coverUrl\":\"/api/v1/albums/" + withCover + "/cover\"");
    // Jazz has no album with a cover, so it has no cover URL.
    assertThat(response.body()).contains("\"name\":\"Jazz\",\"slug\":\"jazz\",\"trackCount\":1}");
  }

  @Test
  void spellingsThatDifferOnlyInCaseSpacingOrPunctuationAreOneGenre() throws Exception {
    track("a", null, "Hip-Hop", 4);
    track("b", null, "hip hop", 3);
    track("c", null, " HIP/HOP ", 2);
    track("d", null, "Hip-Hop", 1);

    var body = session.get("/api/v1/genres").body();

    assertThat(field(body, "slug")).containsExactly("hip-hop");
    assertThat(body).contains("\"name\":\"Hip-Hop\"").contains("\"trackCount\":4");
  }

  @Test
  void genresInOtherScriptsKeepTheirOwnSlug() throws Exception {
    track("a", null, "বাংলা", 1);
    track("b", null, "Ｊ-Ｐｏｐ", 1);

    var slugs = field(session.get("/api/v1/genres").body(), "slug");

    assertThat(slugs).hasSize(2).doesNotContain("");
  }

  @Test
  void tracksCanBeFilteredByGenreSlugAndTheTotalFollows() throws Exception {
    track("rock one", null, "Rock", 3);
    track("rock two", null, "rock ", 2);
    track("jazz one", null, "Jazz", 1);

    var rock = session.get("/api/v1/tracks?genre=rock");

    assertThat(field(rock.body(), "title")).containsExactlyInAnyOrder("rock one", "rock two");
    assertThat(rock.headers().firstValue("X-Total-Count")).contains("2");
    assertThat(session.get("/api/v1/tracks?genre=nothing").body()).isEqualTo("[]");
    assertThat(session.get("/api/v1/tracks").headers().firstValue("X-Total-Count")).contains("3");
  }

  @Test
  void recentlyAddedFollowsIngestTimeAndAnAlbumRisesWhenATrackIsAddedToIt() throws Exception {
    var old = album("Old", false);
    var middle = album("Middle", false);
    var fresh = album("Fresh", true);
    track("o", old, null, 30);
    track("m", middle, null, 20);
    track("f", fresh, null, 10);

    assertThat(field(session.get("/api/v1/albums/recent").body(), "title"))
        .containsExactly("Fresh", "Middle", "Old");

    track("new track on old album", old, null, 0);

    assertThat(field(session.get("/api/v1/albums/recent").body(), "title"))
        .containsExactly("Old", "Fresh", "Middle");
    assertThat(field(session.get("/api/v1/albums/recent?limit=1").body(), "title"))
        .containsExactly("Old");
  }

  @Test
  void featuredIsTheNewestAlbumWithACoverOrNothing() throws Exception {
    assertThat(session.get("/api/v1/albums/featured").statusCode()).isEqualTo(204);

    var covered = album("Covered", true);
    var newerNoCover = album("Newer but plain", false);
    track("c", covered, null, 10);
    track("n", newerNoCover, null, 1);

    var response = session.get("/api/v1/albums/featured");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(field(response.body(), "title")).containsExactly("Covered");
    assertThat(response.body()).contains("\"dominantColor\":\"#336699\"");
  }

  @Test
  void mostPlayedFollowsRealQualifyingPlays() throws Exception {
    var a = track("Alpha", null, null, 2);
    var b = track("Beta", null, null, 1);
    play(a, 2);
    play(b, 1);

    assertThat(field(session.get("/api/v1/history/most-played").body(), "title"))
        .containsExactly("Alpha", "Beta");

    play(b, 3);

    assertThat(field(session.get("/api/v1/history/most-played").body(), "title"))
        .containsExactly("Beta", "Alpha");
  }

  @Test
  void everythingNeedsALogin() throws Exception {
    var anonymous = new Session(port);
    for (var path : List.of("/api/v1/genres", "/api/v1/albums/recent", "/api/v1/albums/featured")) {
      assertThat(anonymous.get(path).statusCode()).as(path).isEqualTo(401);
    }
  }
}
