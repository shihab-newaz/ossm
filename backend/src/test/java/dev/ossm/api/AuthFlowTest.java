package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestConfiguration.class)
class AuthFlowTest {

  private static final String LOGIN_OK =
      "{\"username\":\"admin\",\"password\":\"correct horse battery\"}";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstance() {
    AuthTestSupport.resetInstance(jdbc);
  }

  @Test
  void freshInstanceNeedsSetupAndSetupCreatesAnAdminWhoIsLoggedIn() throws Exception {
    var browser = new Session(port);

    assertThat(browser.get("/api/v1/setup").body()).contains("\"setupRequired\":true");

    var setup = browser.post("/api/v1/setup", ADMIN_SETUP);
    assertThat(setup.statusCode()).isEqualTo(201);
    assertThat(setup.body()).contains("\"username\":\"admin\"").contains("\"role\":\"ADMIN\"");
    assertThat(setup.body()).doesNotContain("password");

    var me = browser.get("/api/v1/auth/me");
    assertThat(me.statusCode()).isEqualTo(200);
    assertThat(me.body()).contains("\"username\":\"admin\"");
    assertThat(browser.get("/api/v1/setup").body()).contains("\"setupRequired\":false");
  }

  @Test
  void setupIsUnavailableOnceAnyUserExists() throws Exception {
    new Session(port).post("/api/v1/setup", ADMIN_SETUP);

    var stranger = new Session(port);
    var again =
        stranger.post(
            "/api/v1/setup", "{\"username\":\"intruder\",\"password\":\"another long password\"}");

    assertThat(again.statusCode()).isEqualTo(409);
    assertThat(again.headers().firstValue("Content-Type").orElse(""))
        .startsWith("application/problem+json");
    assertThat(stranger.get("/api/v1/auth/me").statusCode()).isEqualTo(401);
    assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isEqualTo(1);
  }

  @Test
  void setupRejectsWeakOrMalformedInput() throws Exception {
    var browser = new Session(port);

    var shortPassword =
        browser.post("/api/v1/setup", "{\"username\":\"admin\",\"password\":\"short\"}");
    var badUsername =
        browser.post(
            "/api/v1/setup", "{\"username\":\"Ad Min!\",\"password\":\"correct horse battery\"}");

    assertThat(shortPassword.statusCode()).isEqualTo(400);
    assertThat(badUsername.statusCode()).isEqualTo(400);
    assertThat(browser.get("/api/v1/setup").body()).contains("\"setupRequired\":true");
  }

  @Test
  void passwordsAreStoredAsArgon2idHashes() throws Exception {
    new Session(port).post("/api/v1/setup", ADMIN_SETUP);

    var stored = jdbc.queryForObject("select password_hash from users", String.class);

    assertThat(stored).startsWith("$argon2id$").doesNotContain("correct horse battery");
  }

  @Test
  void correctCredentialsLogInAndWrongOnesAreIndistinguishable() throws Exception {
    new Session(port).post("/api/v1/setup", ADMIN_SETUP);

    var ok = new Session(port).post("/api/v1/auth/login", LOGIN_OK);
    var wrongPassword =
        new Session(port)
            .post("/api/v1/auth/login", "{\"username\":\"admin\",\"password\":\"nope nope nope\"}");
    var unknownUser =
        new Session(port)
            .post(
                "/api/v1/auth/login",
                "{\"username\":\"ghost\",\"password\":\"correct horse battery\"}");

    assertThat(ok.statusCode()).isEqualTo(200);
    assertThat(wrongPassword.statusCode()).isEqualTo(401);
    assertThat(unknownUser.statusCode()).isEqualTo(401);
    assertThat(unknownUser.body()).isEqualTo(wrongPassword.body());
    assertThat(wrongPassword.body()).doesNotContain("ghost").doesNotContain("admin");
  }

  @Test
  void usernameMatchingIgnoresCase() throws Exception {
    new Session(port).post("/api/v1/setup", ADMIN_SETUP);

    var login =
        new Session(port)
            .post(
                "/api/v1/auth/login",
                "{\"username\":\"ADMIN\",\"password\":\"correct horse battery\"}");

    assertThat(login.statusCode()).isEqualTo(200);
  }

  @Test
  void sessionCookieIsHttpOnlyAndLongLived() throws Exception {
    var setup = new Session(port).post("/api/v1/setup", ADMIN_SETUP);

    var cookie =
        setup.headers().allValues("Set-Cookie").stream()
            .filter(c -> c.startsWith("OSSM_SESSION="))
            .findFirst()
            .orElseThrow();
    assertThat(cookie).contains("HttpOnly").contains("SameSite=Lax").contains("Path=/");
    assertThat(cookie).containsPattern("Max-Age=\\d{6,}");
  }

  @Test
  void missingSessionGetsAProblemDetailsUnauthorized() throws Exception {
    var response = new Session(port).get("/api/v1/auth/me");

    assertThat(response.statusCode()).isEqualTo(401);
    assertThat(response.headers().firstValue("Content-Type").orElse(""))
        .startsWith("application/problem+json");
    assertThat(response.body()).contains("\"status\":401");
  }

  @Test
  void logoutInvalidatesTheSessionServerSide() throws Exception {
    var browser = new Session(port);
    browser.post("/api/v1/setup", ADMIN_SETUP);
    var cookie = browser.sessionCookie();
    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", cookie).statusCode()).isEqualTo(200);

    var logout = browser.post("/api/v1/auth/logout", "");

    assertThat(logout.statusCode()).isEqualTo(204);
    // The old cookie, replayed by hand, no longer works: the session is gone, not just forgotten.
    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", cookie).statusCode()).isEqualTo(401);
    assertThat(
            jdbc.queryForList(
                "select session_id, principal_name, creation_time, last_access_time from spring_session"))
        .isEmpty();
  }

  @Test
  void loggingOutWithoutASessionIsHarmless() throws Exception {
    assertThat(new Session(port).post("/api/v1/auth/logout", "").statusCode()).isEqualTo(204);
  }
}
