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
    jdbc.update(
        "insert into upload (id, user_id, filename, size_bytes, object_key, s3_upload_id, status)"
            + " values (?, ?, 'song.mp3', 10, ?, 'x', ?)",
        id,
        user,
        "audio/" + id + ".mp3",
        status);
    return id;
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
