package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** Sessions live in Postgres, so a routine API restart must not log anyone out. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestConfiguration.class)
class SessionSurvivesRestartTest {

  @Autowired DataSource dataSource;
  @Autowired JdbcTemplate jdbc;

  @Test
  void sessionCookieStillWorksAfterTheApiRestarts() throws Exception {
    AuthTestSupport.resetInstance(jdbc);
    var db = (HikariDataSource) dataSource;

    String cookie;
    var first = startApi(db);
    try {
      var browser = new Session(portOf(first));
      assertThat(browser.post("/api/v1/setup", ADMIN_SETUP).statusCode()).isEqualTo(201);
      cookie = browser.sessionCookie();
    } finally {
      first.close();
    }

    var second = startApi(db);
    try {
      var me = Session.getWithCookie(portOf(second), "/api/v1/auth/me", cookie);
      assertThat(me.statusCode()).isEqualTo(200);
      assertThat(me.body()).contains("\"username\":\"admin\"");
    } finally {
      second.close();
    }
  }

  private static ConfigurableApplicationContext startApi(HikariDataSource db) {
    return SpringApplication.run(
        OssmApiApplication.class,
        "--server.port=0",
        "--spring.datasource.url=" + db.getJdbcUrl(),
        "--spring.datasource.username=" + db.getUsername(),
        "--spring.datasource.password=" + db.getPassword());
  }

  private static int portOf(ConfigurableApplicationContext context) {
    return ((WebServerApplicationContext) context).getWebServer().getPort();
  }
}
