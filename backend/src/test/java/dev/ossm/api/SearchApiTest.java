package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Search over the shared library, on rows inserted directly. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class SearchApiTest {

  private static final ObjectMapper JSON = new ObjectMapper();

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private Session session;
  private UUID uploader;

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

  private UUID album(UUID artist, String title) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into album (id, title, title_key, artist_id) values (?, ?, ?, ?)",
        id,
        title,
        title.toLowerCase(),
        artist);
    return id;
  }

  private UUID track(UUID artist, UUID album, String title) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into track (id, title, artist_id, album_id, duration_ms, object_key, size_bytes,"
            + " uploader_id) values (?, ?, ?, ?, 1000, ?, 1, ?)",
        id,
        title,
        artist,
        album,
        "audio/" + id + ".mp3",
        uploader);
    return id;
  }

  private JsonNode search(String q) throws Exception {
    var response = session.get("/api/v1/search?q=" + URLEncoder.encode(q, StandardCharsets.UTF_8));
    assertThat(response.statusCode()).isEqualTo(200);
    return JSON.readTree(response.body());
  }

  private static List<String> titles(JsonNode group, String field) {
    var out = new ArrayList<String>();
    group.forEach(item -> out.add(item.get(field).asString()));
    return out;
  }

  @Test
  void aPartialWordFindsTheTrackAmongTheGroupedResults() throws Exception {
    var band = artist("Portishead");
    track(band, null, "Glory Box");
    track(band, null, "Roads");

    var result = search("glo");

    assertThat(titles(result.get("tracks"), "title")).containsExactly("Glory Box");
    assertThat(result.get("albums")).isEmpty();
    assertThat(result.get("artists")).isEmpty();
  }

  @Test
  void misspelledQueriesStillFindTheIntendedTrackFirst() throws Exception {
    var band = artist("Portishead");
    track(band, null, "Glory Box");
    track(band, null, "Sour Times");
    track(band, null, "Roads");
    track(band, null, "Mysterons");

    var expected =
        java.util.Map.of(
            "glroy box", "Glory Box", // two letters swapped
            "gloary box", "Glory Box", // an extra letter
            "sour tims", "Sour Times", // a missing letter
            "mistrerons", "Mysterons", // a vowel wrong, a letter added
            "rodas", "Roads"); // swapped and partial

    for (var query : expected.keySet()) {
      var tracks = titles(search(query).get("tracks"), "title");
      assertThat(tracks).as("results for \"%s\"", query).isNotEmpty();
      assertThat(tracks.get(0)).as("best match for \"%s\"", query).isEqualTo(expected.get(query));
    }
  }

  @Test
  void anArtistNameFindsTheArtistTheirAlbumsAndTheirTracks() throws Exception {
    var radiohead = artist("Radiohead");
    var okComputer = album(radiohead, "OK Computer");
    track(radiohead, okComputer, "Paranoid Android");
    track(radiohead, okComputer, "Karma Police");
    var portishead = artist("Portishead");
    track(portishead, album(portishead, "Dummy"), "Glory Box");

    var result = search("radiohead");

    assertThat(titles(result.get("artists"), "name")).containsExactly("Radiohead");
    assertThat(titles(result.get("albums"), "title")).containsExactly("OK Computer");
    assertThat(titles(result.get("tracks"), "title"))
        .containsExactlyInAnyOrder("Paranoid Android", "Karma Police");
  }

  @Test
  void tracksAreFoundByTitleAndArtistTogether() throws Exception {
    var radiohead = artist("Radiohead");
    var okComputer = album(radiohead, "OK Computer");
    track(radiohead, okComputer, "Karma Police");
    var other = artist("Some Cover Band");
    track(other, null, "Karma Police");

    var tracks = titles(search("karma police radiohead").get("tracks"), "artist");

    assertThat(tracks).isNotEmpty();
    assertThat(tracks.get(0)).isEqualTo("Radiohead");
  }

  @Test
  void whatIsTypedSoFarFindsLongWordsFromTheirFirstLetters() throws Exception {
    var artist = artist("Beyonce");
    track(artist, null, "Dangerously In Love");
    track(artist, null, "Glory Box");
    track(artist, null, "Roads");

    var expected =
        java.util.Map.of(
            "d", "Dangerously In Love",
            "da", "Dangerously In Love",
            "dang", "Dangerously In Love",
            "dangerously in l", "Dangerously In Love",
            "glory bo", "Glory Box",
            "r", "Roads");

    for (var query : expected.keySet()) {
      var tracks = titles(search(query).get("tracks"), "title");
      assertThat(tracks).as("results for \"%s\"", query).contains(expected.get(query));
    }
  }

  @Test
  void blankAndPunctuationOnlyQueriesFindNothing() throws Exception {
    track(artist("Portishead"), null, "Glory Box");

    for (var query : List.of("", "   ", "!!!", "-", "'")) {
      var result = search(query);
      assertThat(result.get("tracks")).as("tracks for \"%s\"", query).isEmpty();
      assertThat(result.get("top") == null || result.get("top").isNull()).isTrue();
    }
  }

  @Test
  void aTitleMatchOutranksOneFoundOnlyThroughTheAlbumOrArtist() throws Exception {
    var portishead = artist("Portishead");
    var dummy = album(portishead, "Dummy");
    track(portishead, dummy, "Glory Box");
    track(artist("Some Band"), null, "Zed Dummy");

    var tracks = titles(search("dummy").get("tracks"), "title");

    assertThat(tracks).containsExactly("Zed Dummy", "Glory Box");
  }

  @Test
  void theTopResultIsTheBestMatchAcrossTheGroups() throws Exception {
    var radiohead = artist("Radiohead");
    var okComputer = album(radiohead, "OK Computer");
    var karma = track(radiohead, okComputer, "Karma Police");
    track(radiohead, okComputer, "Paranoid Android");

    var byArtist = search("radiohead").get("top");
    assertThat(byArtist.get("type").asString()).isEqualTo("artist");
    assertThat(byArtist.get("id").asString()).isEqualTo(radiohead.toString());

    var byAlbum = search("ok computer").get("top");
    assertThat(byAlbum.get("type").asString()).isEqualTo("album");
    assertThat(byAlbum.get("id").asString()).isEqualTo(okComputer.toString());

    var byTrack = search("karma police").get("top");
    assertThat(byTrack.get("type").asString()).isEqualTo("track");
    assertThat(byTrack.get("id").asString()).isEqualTo(karma.toString());
  }

  @Test
  void anArtistOutranksAnAlbumOrTrackOfTheSameName() throws Exception {
    var heroes = artist("Heroes");
    var bowie = artist("David Bowie");
    track(bowie, album(bowie, "Heroes"), "Heroes");

    var top = search("heroes").get("top");

    assertThat(top.get("type").asString()).isEqualTo("artist");
    assertThat(top.get("id").asString()).isEqualTo(heroes.toString());
  }

  @Test
  void theTopResultIsLeftOutWhenNothingMatches() throws Exception {
    track(artist("Portishead"), null, "Glory Box");

    var result = search("xylophone");

    assertThat(result.get("top") == null || result.get("top").isNull()).isTrue();
  }

  @Test
  void searchNeedsALogin() throws Exception {
    track(artist("Portishead"), null, "Glory Box");

    assertThat(Http.get(port, "/api/v1/search?q=glory").statusCode()).isEqualTo(401);
  }

  @Test
  void everyUserSearchesTheSameSharedLibrary() throws Exception {
    track(artist("Portishead"), null, "Glory Box");
    var invite =
        session.post("/api/v1/users", "{\"username\":\"listener\",\"role\":\"USER\"}").body();
    var token = JSON.readTree(invite).get("token").asString();
    var listener = new Session(port);
    assertThat(
            listener
                .post(
                    "/api/v1/invites/" + token + "/accept",
                    "{\"password\":\"another long passphrase\"}")
                .statusCode())
        .isEqualTo(201);

    var response = listener.get("/api/v1/search?q=glory");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(titles(JSON.readTree(response.body()).get("tracks"), "title"))
        .containsExactly("Glory Box");
  }

  @Test
  void eachGroupHoldsAtMostLimitHits() throws Exception {
    var band = artist("Band");
    for (int i = 0; i < 5; i++) {
      track(band, album(band, "Greatest Hits " + i), "Greatest Song " + i);
    }

    var result = JSON.readTree(session.get("/api/v1/search?q=greatest&limit=2").body());

    assertThat(result.get("tracks")).hasSize(2);
    assertThat(result.get("albums")).hasSize(2);
    // Eight is the default.
    assertThat(search("greatest").get("tracks")).hasSize(5);
  }

  @Test
  void badLimitsAndOverlongQueriesAreRefused() throws Exception {
    assertThat(session.get("/api/v1/search?q=a&limit=0").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/search?q=a&limit=51").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/search?q=a&limit=abc").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/search?q=" + "a".repeat(201)).statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/search").statusCode()).isEqualTo(400);
    assertThat(session.get("/api/v1/search?q=" + "a".repeat(200)).statusCode()).isEqualTo(200);
  }

  @Test
  void searchStaysQuickOnALibraryOfSeveralThousandTracks() throws Exception {
    // 6,000 tracks on 1,500 albums by 500 artists, with names that share many trigrams.
    jdbc.update(
        "insert into artist (id, name, name_key) select gen_random_uuid(), 'Artist '"
            + " || substr(md5(n::text), 1, 7), 'k' || n from generate_series(1, 500) n");
    jdbc.update(
        "insert into album (id, title, title_key, artist_id) select gen_random_uuid(), 'Album '"
            + " || substr(md5((n * 7)::text), 1, 8), 'k' || n,"
            + " (select id from artist order by name_key limit 1 offset n % 500)"
            + " from generate_series(1, 1500) n");
    jdbc.update(
        "insert into track (id, title, artist_id, album_id, duration_ms, object_key, size_bytes,"
            + " uploader_id) select gen_random_uuid(), 'Song ' || substr(md5((n * 13)::text), 1, 9)"
            + " || ' ' || substr(md5(n::text), 1, 5),"
            + " (select id from artist order by name_key limit 1 offset n % 500),"
            + " (select id from album order by title_key limit 1 offset n % 1500),"
            + " 1000, 'audio/' || n, 1, ? from generate_series(1, 6000) n",
        uploader);
    jdbc.execute("analyze");
    assertThat(jdbc.queryForObject("select count(*) from track", Integer.class)).isEqualTo(6000);

    var worst = 0L;
    for (var query : List.of("song", "so", "s", "artist 3f", "album a", "sogn 9c", "zzzz")) {
      search(query); // warm up
      var start = System.nanoTime();
      search(query);
      worst = Math.max(worst, (System.nanoTime() - start) / 1_000_000);
    }

    // A generous bound for a CI box; a sequential scan of this size would still be inside it, so
    // this guards against something pathological (a cross join, no limit), not against tuning.
    assertThat(worst).as("slowest query in ms").isLessThan(500);
  }

  @Test
  void unrelatedQueriesFindNothing() throws Exception {
    var band = artist("Portishead");
    track(band, null, "Glory Box");
    track(band, null, "Sour Times");
    track(band, null, "Roads");

    for (var query : List.of("xylophone", "zzzz", "quantum mechanics", "beethoven")) {
      var result = search(query);
      assertThat(result.get("tracks")).as("tracks for \"%s\"", query).isEmpty();
      assertThat(result.get("albums")).as("albums for \"%s\"", query).isEmpty();
      assertThat(result.get("artists")).as("artists for \"%s\"", query).isEmpty();
    }
  }
}
