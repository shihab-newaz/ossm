package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class PlaybackEventsTest {

  private static final String PASSWORD = "a long enough password";
  private static final String EVENTS = "/api/v1/events/playback";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

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
    var matcher = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(invite.body());
    assertThat(matcher.find()).as(invite.body()).isTrue();
    var browser = new Session(port);
    var accepted =
        browser.post(
            "/api/v1/invites/" + matcher.group(1) + "/accept",
            "{\"password\":\"" + PASSWORD + "\"}");
    assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(201);
    return browser;
  }

  /** A track straight into the library; these tests are about events, not ingest. */
  private UUID track(String title) {
    var uploader = jdbc.queryForObject("select id from users limit 1", UUID.class);
    var artist = UUID.randomUUID();
    jdbc.update(
        "insert into artist (id, name, name_key) values (?, 'Band', ?)", artist, artist.toString());
    var track = UUID.randomUUID();
    jdbc.update(
        "insert into track (id, title, artist_id, duration_ms, object_key, size_bytes, uploader_id)"
            + " values (?, ?, ?, 200000, ?, 1, ?)",
        track,
        title,
        artist,
        "audio/" + track + ".mp3",
        uploader);
    return track;
  }

  private static String event(UUID id, UUID track, String type, long positionMs, Instant at) {
    return ("{\"eventId\":\"%s\",\"schemaVersion\":1,\"trackId\":\"%s\",\"type\":\"%s\","
            + "\"occurredAt\":\"%s\",\"positionMs\":%d,\"clientId\":\"browser-1\"}")
        .formatted(id, track, type, at, positionMs);
  }

  private void send(Session who, UUID track, String type, long positionMs, Instant at)
      throws Exception {
    var response = who.post(EVENTS, event(UUID.randomUUID(), track, type, positionMs, at));
    assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
  }

  private static List<String> titles(String json) {
    var matcher = Pattern.compile("\"title\":\"([^\"]+)\"").matcher(json);
    var titles = new java.util.ArrayList<String>();
    while (matcher.find()) {
      titles.add(matcher.group(1));
    }
    return titles;
  }

  @Test
  void anEventIsStoredWithEveryEnvelopeField() throws Exception {
    var admin = admin();
    var track = track("Stored");
    var id = UUID.randomUUID();
    var at = Instant.parse("2026-03-04T05:06:07.123Z");

    var response = admin.post(EVENTS, event(id, track, "play_completed", 30_000, at));

    assertThat(response.statusCode()).isEqualTo(202);
    var row = jdbc.queryForMap("select * from play_event where event_id = ?", id);
    assertThat(row.get("schema_version")).isEqualTo(1);
    assertThat(row.get("user_id"))
        .isEqualTo(jdbc.queryForObject("select id from users", UUID.class));
    assertThat(row.get("track_id")).isEqualTo(track);
    assertThat(row.get("type")).isEqualTo("play_completed");
    assertThat(row.get("position_ms")).isEqualTo(30_000L);
    assertThat(row.get("client_id")).isEqualTo("browser-1");
    assertThat(
            jdbc.queryForObject(
                    "select occurred_at from play_event where event_id = ?",
                    java.time.OffsetDateTime.class,
                    id)
                .toInstant())
        .isEqualTo(at);
    assertThat(row.get("received_at")).isNotNull();
  }

  @Test
  void sendingTheSameEventTwiceStoresItOnce() throws Exception {
    var admin = admin();
    var track = track("Once");
    var body = event(UUID.randomUUID(), track, "play_started", 0, Instant.now());

    assertThat(admin.post(EVENTS, body).statusCode()).isEqualTo(202);
    assertThat(admin.post(EVENTS, body).statusCode()).isEqualTo(202);

    assertThat(jdbc.queryForObject("select count(*) from play_event", Integer.class)).isEqualTo(1);
  }

  @Test
  void anEventIdBelongingToSomeoneElseIsRefusedAndTheOriginalStaysIntact() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var track = track("Taken");
    var id = UUID.randomUUID();
    assertThat(admin.post(EVENTS, event(id, track, "play_started", 0, Instant.now())).statusCode())
        .isEqualTo(202);

    var clash = grace.post(EVENTS, event(id, track, "skipped", 5_000, Instant.now()));

    assertThat(clash.statusCode()).isEqualTo(409);
    assertThat(
            jdbc.queryForObject("select type from play_event where event_id = ?", String.class, id))
        .isEqualTo("play_started");
    assertThat(jdbc.queryForObject("select count(*) from play_event", Integer.class)).isEqualTo(1);
  }

  @Test
  void theUserIsTheSessionsNotTheBodys() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var track = track("Mine");
    var body =
        event(UUID.randomUUID(), track, "play_completed", 31_000, Instant.now())
            .replace("{", "{\"userId\":\"" + UUID.randomUUID() + "\",");

    assertThat(grace.post(EVENTS, body).statusCode()).isEqualTo(202);

    var graceId = jdbc.queryForObject("select id from users where username = 'grace'", UUID.class);
    assertThat(jdbc.queryForObject("select user_id from play_event", UUID.class))
        .isEqualTo(graceId);
  }

  @Test
  void invalidEventsAreRejectedAndNothingIsStored() throws Exception {
    var admin = admin();
    var track = track("Invalid");
    var good = event(UUID.randomUUID(), track, "play_started", 0, Instant.now());

    assertThat(admin.post(EVENTS, good.replace("play_started", "exploded")).statusCode())
        .isEqualTo(400);
    assertThat(
            admin
                .post(EVENTS, good.replace("\"schemaVersion\":1", "\"schemaVersion\":2"))
                .statusCode())
        .isEqualTo(400);
    assertThat(
            admin.post(EVENTS, good.replace("\"positionMs\":0", "\"positionMs\":-1")).statusCode())
        .isEqualTo(400);
    assertThat(
            admin
                .post(EVENTS, good.replace("\"clientId\":\"browser-1\"", "\"clientId\":\" \""))
                .statusCode())
        .isEqualTo(400);
    assertThat(admin.post(EVENTS, good.replaceAll("\"eventId\":\"[^\"]+\",", "")).statusCode())
        .isEqualTo(400);
    var unknownTrack =
        admin.post(
            EVENTS, event(UUID.randomUUID(), UUID.randomUUID(), "skipped", 1, Instant.now()));
    assertThat(unknownTrack.statusCode()).isEqualTo(404);
    assertThat(unknownTrack.body()).contains("No such track");

    assertThat(jdbc.queryForObject("select count(*) from play_event", Integer.class)).isZero();
  }

  @Test
  void anonymousCallersAreTurnedAway() throws Exception {
    admin();
    var anonymous = new Session(port);

    assertThat(
            anonymous
                .post(
                    EVENTS,
                    event(UUID.randomUUID(), UUID.randomUUID(), "skipped", 1, Instant.now()))
                .statusCode())
        .isEqualTo(401);
    assertThat(anonymous.get("/api/v1/history").statusCode()).isEqualTo(401);
    assertThat(anonymous.get("/api/v1/history/most-played").statusCode()).isEqualTo(401);
  }

  @Test
  void historyListsOnlyYourQualifyingPlaysNewestFirst() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var first = track("First");
    var second = track("Second");
    var skipped = track("Skipped");
    var graces = track("Graces");
    var t0 = Instant.parse("2026-03-04T10:00:00Z");
    send(admin, first, "play_started", 0, t0);
    send(admin, first, "play_completed", 30_000, t0.plusSeconds(30));
    send(admin, skipped, "play_started", 0, t0.plusSeconds(60));
    send(admin, skipped, "skipped", 4_000, t0.plusSeconds(64));
    send(admin, second, "play_completed", 31_000, t0.plusSeconds(120));
    send(admin, first, "play_completed", 30_000, t0.plusSeconds(400));
    send(grace, graces, "play_completed", 30_000, t0.plusSeconds(500));

    var mine = admin.get("/api/v1/history");

    assertThat(mine.statusCode()).isEqualTo(200);
    assertThat(titles(mine.body())).containsExactly("First", "Second", "First");
    assertThat(mine.body()).contains("\"playedAt\":\"2026-03-04T10:06:40Z\"");
    assertThat(titles(grace.get("/api/v1/history").body())).containsExactly("Graces");
  }

  @Test
  void mostPlayedCountsYourQualifyingPlaysPerTrack() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var often = track("Often");
    var once = track("Once");
    var never = track("Never");
    var t0 = Instant.parse("2026-03-04T10:00:00Z");
    for (int i = 0; i < 3; i++) {
      send(admin, often, "play_completed", 30_000, t0.plusSeconds(i * 300L));
    }
    send(admin, once, "play_completed", 30_000, t0.plusSeconds(1000));
    send(admin, never, "play_started", 0, t0.plusSeconds(2000));
    send(admin, never, "skipped", 3_000, t0.plusSeconds(2003));
    for (int i = 0; i < 5; i++) {
      send(grace, once, "play_completed", 30_000, t0.plusSeconds(i * 300L));
    }

    var mine = admin.get("/api/v1/history/most-played");

    assertThat(mine.statusCode()).isEqualTo(200);
    assertThat(titles(mine.body())).containsExactly("Often", "Once");
    assertThat(mine.body()).contains("\"plays\":3").contains("\"plays\":1");
    assertThat(grace.get("/api/v1/history/most-played").body()).contains("\"plays\":5");
  }

  @Test
  void theLimitIsHonouredAndKeptInRange() throws Exception {
    var admin = admin();
    var track = track("Loop");
    var t0 = Instant.parse("2026-03-04T10:00:00Z");
    for (int i = 0; i < 3; i++) {
      send(admin, track, "play_completed", 30_000, t0.plusSeconds(i));
    }

    assertThat(titles(admin.get("/api/v1/history?limit=2").body())).hasSize(2);
    assertThat(titles(admin.get("/api/v1/history?limit=0").body())).hasSize(1);
    assertThat(titles(admin.get("/api/v1/history?limit=99999").body())).hasSize(3);
  }
}
