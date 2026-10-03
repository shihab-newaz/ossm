package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

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

/** Paging, ordering and detail for tracks, albums and artists, on rows inserted directly. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class BrowseLibraryTest {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private Session session;
  private UUID uploader;
  private final OffsetDateTime base = OffsetDateTime.parse("2026-01-01T00:00:00Z");

  @BeforeEach
  void freshInstance() throws Exception {
    AuthTestSupport.resetInstance(jdbc);
    session = new Session(port);
    assertThat(session.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
    uploader = jdbc.queryForObject("select id from users", UUID.class);
  }

  private UUID artist(String name) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into artist (id, name, name_key) values (?, ?, ?)", id, name, name.toLowerCase());
    return id;
  }

  private UUID album(UUID artist, String title, Integer year, boolean cover, int ageDays) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into album (id, title, title_key, artist_id, year, cover_key, dominant_color,"
            + " created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        title,
        title.toLowerCase(),
        artist,
        year,
        cover ? "covers/aa/" + id + ".jpg" : null,
        cover ? "#336699" : null,
        base.minusDays(ageDays));
    return id;
  }

  private UUID track(
      UUID artist, UUID album, String title, Integer disc, Integer number, long ms, int ageDays) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into track (id, title, artist_id, album_id, disc_number, track_number, duration_ms,"
            + " object_key, size_bytes, uploader_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, 1,"
            + " ?, ?)",
        id,
        title,
        artist,
        album,
        disc,
        number,
        ms,
        "audio/" + id + ".mp3",
        uploader,
        base.minusDays(ageDays));
    return id;
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
  void trackPagesTileTheLibraryWithNoOverlapAndTheTotalIsReported() throws Exception {
    var band = artist("Band");
    var tied = base.minusDays(1);
    for (int i = 0; i < 7; i++) {
      var id = track(band, null, "Song " + i, null, null, 1000, 1);
      jdbc.update("update track set created_at = ? where id = ?", tied, id);
    }

    var all = new ArrayList<String>();
    for (int offset = 0; offset < 7; offset += 3) {
      var page = session.get("/api/v1/tracks?limit=3&offset=" + offset);
      assertThat(page.statusCode()).isEqualTo(200);
      assertThat(page.headers().firstValue("X-Total-Count")).contains("7");
      all.addAll(field(page.body(), "id"));
    }

    assertThat(all).hasSize(7).doesNotHaveDuplicates();
    assertThat(field(session.get("/api/v1/tracks").body(), "id")).containsExactlyElementsOf(all);
  }

  @Test
  void tracksSortByAddedTitleOrArtist() throws Exception {
    var abba = artist("ABBA");
    var zed = artist("zed");
    var lp = album(zed, "Alpha LP", 2000, false, 0);
    track(zed, lp, "banana", null, 2, 1000, 3);
    track(zed, lp, "Apple", null, 1, 1000, 2);
    track(abba, null, "cherry", null, null, 1000, 1);

    assertThat(field(session.get("/api/v1/tracks").body(), "title"))
        .containsExactly("cherry", "Apple", "banana");
    assertThat(field(session.get("/api/v1/tracks?sort=title").body(), "title"))
        .containsExactly("Apple", "banana", "cherry");
    assertThat(field(session.get("/api/v1/tracks?sort=artist").body(), "title"))
        .containsExactly("cherry", "Apple", "banana");
  }

  @Test
  void badPagingOrSortIsRefused() throws Exception {
    assertThat(session.get("/api/v1/tracks?sort=nope").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/tracks?limit=0").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/tracks?limit=1001").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/tracks?offset=-1").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/albums?sort=nope").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/artists?limit=abc").statusCode()).isEqualTo(400);
  }

  @Test
  void tracksCarryTheirArtistAndUploader() throws Exception {
    var band = artist("Band");
    track(band, null, "Single", null, null, 1000, 0);

    var body = session.get("/api/v1/tracks").body();

    assertThat(body).contains("\"artistId\":\"" + band + "\"").contains("\"uploadedBy\":\"admin\"");
  }

  @Test
  void albumsListWithCountsCoversAndOrdering() throws Exception {
    var a = artist("Alpha");
    var b = artist("Beta");
    var old = album(a, "Old One", 1999, false, 10);
    var fresh = album(b, "Fresh", 2024, true, 1);
    track(a, old, "o1", 1, 1, 60_000, 10);
    track(a, old, "o2", 1, 2, 90_000, 10);
    track(b, fresh, "f1", 1, 1, 30_000, 1);

    var byAdded = session.get("/api/v1/albums");

    assertThat(byAdded.headers().firstValue("X-Total-Count")).contains("2");
    assertThat(field(byAdded.body(), "title")).containsExactly("Fresh", "Old One");
    assertThat(byAdded.body())
        .contains("\"coverUrl\":\"/api/v1/albums/" + fresh + "/cover\"")
        .contains("\"dominantColor\":\"#336699\"")
        .contains("\"trackCount\":2")
        .contains("\"durationMs\":150000");
    assertThat(field(session.get("/api/v1/albums?sort=title").body(), "title"))
        .containsExactly("Fresh", "Old One");
    assertThat(field(session.get("/api/v1/albums?sort=artist").body(), "title"))
        .containsExactly("Old One", "Fresh");
    assertThat(field(session.get("/api/v1/albums?limit=1&offset=1").body(), "title"))
        .containsExactly("Old One");
  }

  @Test
  void anAlbumPageHasItsTracksInDiscAndTrackOrderAndSaysWhoAddedIt() throws Exception {
    var a = artist("Alpha");
    var lp = album(a, "Double", 2001, true, 0);
    track(a, lp, "d2t1", 2, 1, 1000, 0);
    track(a, lp, "d1t2", 1, 2, 1000, 0);
    track(a, lp, "d1t1", 1, 1, 1000, 0);
    track(a, lp, "untagged", null, null, 1000, 0);

    var response = session.get("/api/v1/albums/" + lp);

    assertThat(response.statusCode()).isEqualTo(200);
    var body = response.body();
    assertThat(field(body, "title")).contains("Double");
    assertThat(field(body.substring(body.indexOf("\"tracks\"")), "title"))
        .containsExactly("d1t1", "d1t2", "d2t1", "untagged");
    assertThat(body).contains("\"uploadedBy\":\"admin\"").contains("\"uploadedAt\":\"");
  }

  @Test
  void artistsAreListedAToZWithCounts() throws Exception {
    var zed = artist("zed");
    var abba = artist("ABBA");
    var lp = album(abba, "Gold", 1992, true, 0);
    track(abba, lp, "t", 1, 1, 1000, 0);
    track(abba, null, "single", null, null, 1000, 0);
    track(zed, null, "z", null, null, 1000, 0);

    var response = session.get("/api/v1/artists");

    assertThat(response.headers().firstValue("X-Total-Count")).contains("2");
    assertThat(field(response.body(), "name")).containsExactly("ABBA", "zed");
    assertThat(response.body())
        .contains("\"albumCount\":1")
        .contains("\"trackCount\":2")
        .contains("\"coverUrl\":\"/api/v1/albums/" + lp + "/cover\"");
  }

  @Test
  void anArtistPageHasAlbumsNewestFirstAndEveryTrackIncludingSingles() throws Exception {
    var a = artist("Alpha");
    var older = album(a, "Older", 1990, false, 5);
    var newer = album(a, "Newer", 2020, false, 4);
    track(a, older, "in older", 1, 1, 1000, 5);
    track(a, newer, "in newer", 1, 1, 1000, 4);
    track(a, null, "a single", null, null, 1000, 3);

    var response = session.get("/api/v1/artists/" + a);

    assertThat(response.statusCode()).isEqualTo(200);
    var body = response.body();
    var albums = body.substring(body.indexOf("\"albums\""), body.indexOf("\"tracks\""));
    assertThat(field(albums, "title")).containsExactly("Newer", "Older");
    assertThat(field(body.substring(body.indexOf("\"tracks\"")), "title"))
        .containsExactly("in newer", "in older", "a single")
        .hasSize(3);
  }

  @Test
  void unknownIdsAreNotFoundAndAnonymousCallersAreTurnedAway() throws Exception {
    var nobody = UUID.randomUUID();
    assertThat(session.get("/api/v1/albums/" + nobody).statusCode()).isEqualTo(404);
    assertThat(session.get("/api/v1/artists/" + nobody).statusCode()).isEqualTo(404);
    assertThat(session.get("/api/v1/albums/not-a-uuid").statusCode()).isEqualTo(400);

    var anonymous = new Session(port);
    for (var path :
        List.of(
            "/api/v1/tracks",
            "/api/v1/albums",
            "/api/v1/albums/" + nobody,
            "/api/v1/artists",
            "/api/v1/artists/" + nobody)) {
      assertThat(anonymous.get(path).statusCode()).as(path).isEqualTo(401);
    }
  }
}
