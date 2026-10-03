package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import dev.ossm.api.Mp3Fixture.Tags;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Ingest jobs live in Postgres, so a restart must neither lose a queued job nor strand one that a
 * crashed worker was halfway through. Runs against a real Postgres and a real object store.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfrastructure.class)
class IngestSurvivesRestartTest {

  @Autowired DataSource dataSource;
  @Autowired JdbcTemplate jdbc;

  @Value("${ossm.storage.endpoint}")
  String storeEndpoint;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  @Test
  void aQueuedJobRunsAfterTheApiRestarts() throws Exception {
    String uploadId;
    var first = startApi(false);
    try {
      var user = new Session(portOf(first));
      user.post("/api/v1/setup", ADMIN_SETUP);
      uploadId =
          StoreClient.upload(
              user,
              "queued.mp3",
              Mp3Fixture.mp3(new Tags("Queued Song", "Band", null, null, null, null, false)));
      // This worker never runs jobs, so the job is only queued when it goes down.
      assertThat(user.get("/api/v1/uploads/" + uploadId).body())
          .contains("\"status\":\"INGESTING\"");
    } finally {
      first.close();
    }
    assertThat(jdbc.queryForObject("select count(*) from scheduled_tasks", Integer.class))
        .isEqualTo(1);

    var second = startApi(true);
    try {
      var user = new Session(portOf(second));
      user.post(
          "/api/v1/auth/login", "{\"username\":\"admin\",\"password\":\"correct horse battery\"}");
      assertThat(StoreClient.awaitFinished(user, uploadId)).contains("\"status\":\"DONE\"");
      assertThat(user.get("/api/v1/tracks").body()).contains("Queued Song");
    } finally {
      second.close();
    }
  }

  @Test
  void aJobAbandonedByACrashedWorkerIsPickedUpAgain() throws Exception {
    String uploadId;
    var first = startApi(false);
    try {
      var user = new Session(portOf(first));
      user.post("/api/v1/setup", ADMIN_SETUP);
      uploadId =
          StoreClient.upload(
              user,
              "crashed.mp3",
              Mp3Fixture.mp3(new Tags("Crashed Song", "Band", null, null, null, null, false)));
    } finally {
      first.close();
    }
    // As if a worker had picked the job and then died: claimed, but its heartbeat stopped long ago.
    jdbc.update(
        "update scheduled_tasks set picked = true, picked_by = 'dead-worker', last_heartbeat = now() - interval '1 hour'");

    var second = startApi(true);
    try {
      var user = new Session(portOf(second));
      user.post(
          "/api/v1/auth/login", "{\"username\":\"admin\",\"password\":\"correct horse battery\"}");
      assertThat(StoreClient.awaitFinished(user, uploadId)).contains("\"status\":\"DONE\"");
      assertThat(user.get("/api/v1/tracks").body()).contains("Crashed Song");
    } finally {
      second.close();
    }
  }

  private ConfigurableApplicationContext startApi(boolean runJobs) {
    var db = (HikariDataSource) dataSource;
    return SpringApplication.run(
        OssmApiApplication.class,
        "--server.port=0",
        "--spring.datasource.url=" + db.getJdbcUrl(),
        "--spring.datasource.username=" + db.getUsername(),
        "--spring.datasource.password=" + db.getPassword(),
        "--ossm.storage.endpoint=" + storeEndpoint,
        "--ossm.storage.public-url=" + storeEndpoint,
        "--ossm.storage.access-key=" + TestInfrastructure.ACCESS_KEY,
        "--ossm.storage.secret-key=" + TestInfrastructure.SECRET_KEY,
        "--ossm.ingest.enabled=" + runJobs,
        // Short heartbeat so a dead worker is noticed in seconds instead of minutes.
        "--ossm.ingest.heartbeat-interval=2s");
  }

  private static int portOf(ConfigurableApplicationContext context) {
    return ((WebServerApplicationContext) context).getWebServer().getPort();
  }
}
