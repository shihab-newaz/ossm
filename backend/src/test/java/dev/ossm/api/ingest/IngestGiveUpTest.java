package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import dev.ossm.api.AuthTestSupport;
import dev.ossm.api.TestInfrastructure;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** What the user sees when every automatic retry has been used up. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class IngestGiveUpTest {

  @Autowired IngestService ingest;
  @Autowired JdbcTemplate jdbc;

  private final UUID user = UUID.randomUUID();

  @BeforeEach
  void aUser() {
    AuthTestSupport.resetInstance(jdbc);
    jdbc.update(
        "insert into users (id, username, password_hash, role) values (?, 'giveup', null, 'USER')",
        user);
  }

  private UUID upload(String status) {
    var id = UUID.randomUUID();
    // A finished upload points at what it became, which the database insists on.
    var track = status.equals("DONE") || status.equals("DUPLICATE") ? aTrack() : null;
    jdbc.update(
        "insert into upload (id, user_id, filename, size_bytes, object_key, s3_upload_id, status,"
            + " track_id) values (?, ?, 'song.mp3', 10, ?, 'x', ?, ?)",
        id,
        user,
        "audio/" + id + ".mp3",
        status,
        track);
    return id;
  }

  private UUID aTrack() {
    var artist = UUID.randomUUID();
    var track = UUID.randomUUID();
    jdbc.update("insert into artist (id, name, name_key) values (?, 'Someone', 'someone')", artist);
    jdbc.update(
        "insert into track (id, title, artist_id, duration_ms, object_key, size_bytes, uploader_id)"
            + " values (?, 'Song', ?, 1000, ?, 10, ?)",
        track,
        artist,
        "audio/" + track + ".mp3",
        user);
    return track;
  }

  @Test
  void anExhaustedJobBecomesAReadableFailureThatCanBeRetried() {
    var id = upload("INGESTING");

    ingest.giveUp(id);

    assertThat(jdbc.queryForObject("select status from upload where id = ?", String.class, id))
        .isEqualTo("FAILED");
    assertThat(jdbc.queryForObject("select error from upload where id = ?", String.class, id))
        .contains("temporary problem")
        .contains("try again");
  }

  @Test
  void aFinishedUploadIsLeftAlone() {
    var id = upload("DUPLICATE");

    ingest.giveUp(id);

    assertThat(jdbc.queryForObject("select status from upload where id = ?", String.class, id))
        .isEqualTo("DUPLICATE");
  }
}
