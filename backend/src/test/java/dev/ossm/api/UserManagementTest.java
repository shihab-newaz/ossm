package dev.ossm.api;

import static dev.ossm.api.AuthTestSupport.ADMIN_SETUP;
import static org.assertj.core.api.Assertions.assertThat;

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
class UserManagementTest {

  private static final String PASSWORD = "a long enough password";

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

  private String invite(Session admin, String username, String role) throws Exception {
    var response =
        admin.post(
            "/api/v1/users", "{\"username\":\"%s\",\"role\":\"%s\"}".formatted(username, role));
    assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
    return tokenIn(response.body());
  }

  private static String tokenIn(String json) {
    var matcher = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(json);
    assertThat(matcher.find()).as(json).isTrue();
    return matcher.group(1);
  }

  /** Invites a USER and has them accept, returning their logged-in browser. */
  private Session member(Session admin, String username) throws Exception {
    var token = invite(admin, username, "USER");
    var browser = new Session(port);
    var accepted =
        browser.post("/api/v1/invites/" + token + "/accept", "{\"password\":\"" + PASSWORD + "\"}");
    assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(201);
    return browser;
  }

  private String idOf(Session admin, String username) throws Exception {
    var matcher =
        Pattern.compile("\"id\":\"([^\"]+)\",\"username\":\"" + username + "\"")
            .matcher(admin.get("/api/v1/users").body());
    assertThat(matcher.find()).isTrue();
    return matcher.group(1);
  }

  @Test
  void adminInvitesSomeoneWhoSetsTheirOwnPasswordOnce() throws Exception {
    var admin = admin();
    var token = invite(admin, "grace", "USER");

    var pending = admin.get("/api/v1/users").body();
    assertThat(pending).contains("\"username\":\"grace\"").contains("\"status\":\"INVITED\"");
    assertThat(admin.get("/api/v1/users").body()).contains("\"status\":\"ACTIVE\"");

    var info = new Session(port).get("/api/v1/invites/" + token);
    assertThat(info.statusCode()).isEqualTo(200);
    assertThat(info.body()).contains("\"username\":\"grace\"");

    var grace = new Session(port);
    var accepted =
        grace.post("/api/v1/invites/" + token + "/accept", "{\"password\":\"" + PASSWORD + "\"}");
    assertThat(accepted.statusCode()).isEqualTo(201);
    assertThat(accepted.body()).contains("\"role\":\"USER\"");
    assertThat(grace.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
    assertThat(admin.get("/api/v1/users").body()).doesNotContain("INVITED");
    assertThat(
            jdbc.queryForObject(
                "select password_hash from users where username='grace'", String.class))
        .startsWith("$argon2id$");

    // The link is spent.
    assertThat(new Session(port).get("/api/v1/invites/" + token).statusCode()).isEqualTo(404);
    var second =
        new Session(port)
            .post(
                "/api/v1/invites/" + token + "/accept", "{\"password\":\"another long password\"}");
    assertThat(second.statusCode()).isEqualTo(404);
  }

  @Test
  void anExpiredInviteIsDead() throws Exception {
    var admin = admin();
    var token = invite(admin, "grace", "USER");
    jdbc.update("update invites set expires_at = now() - interval '1 minute'");

    assertThat(new Session(port).get("/api/v1/invites/" + token).statusCode()).isEqualTo(404);
    var accept =
        new Session(port)
            .post("/api/v1/invites/" + token + "/accept", "{\"password\":\"" + PASSWORD + "\"}");
    assertThat(accept.statusCode()).isEqualTo(404);
    assertThat(admin.get("/api/v1/users").body()).contains("\"status\":\"INVITED\"");
  }

  @Test
  void aWeakPasswordDoesNotSpendTheInvite() throws Exception {
    var token = invite(admin(), "grace", "USER");

    var weak =
        new Session(port).post("/api/v1/invites/" + token + "/accept", "{\"password\":\"short\"}");

    assertThat(weak.statusCode()).isEqualTo(400);
    assertThat(new Session(port).get("/api/v1/invites/" + token).statusCode()).isEqualTo(200);
  }

  @Test
  void aPendingUserCannotLogInAndAnUnknownTokenIsNotFound() throws Exception {
    invite(admin(), "grace", "USER");

    var login =
        new Session(port).post("/api/v1/auth/login", "{\"username\":\"grace\",\"password\":\"\"}");
    var guess =
        new Session(port)
            .post(
                "/api/v1/auth/login", "{\"username\":\"grace\",\"password\":\"anything at all\"}");

    assertThat(login.statusCode()).isEqualTo(400);
    assertThat(guess.statusCode()).isEqualTo(401);
    assertThat(new Session(port).get("/api/v1/invites/not-a-real-token").statusCode())
        .isEqualTo(404);
  }

  @Test
  void usernamesMustBeValidAndUnique() throws Exception {
    var admin = admin();
    invite(admin, "grace", "USER");

    var duplicate = admin.post("/api/v1/users", "{\"username\":\"grace\",\"role\":\"USER\"}");
    var sameAsAdmin = admin.post("/api/v1/users", "{\"username\":\"admin\",\"role\":\"USER\"}");
    var invalid = admin.post("/api/v1/users", "{\"username\":\"No Spaces\",\"role\":\"USER\"}");
    var noRole = admin.post("/api/v1/users", "{\"username\":\"henry\"}");

    assertThat(duplicate.statusCode()).isEqualTo(409);
    assertThat(sameAsAdmin.statusCode()).isEqualTo(409);
    assertThat(invalid.statusCode()).isEqualTo(400);
    assertThat(noRole.statusCode()).isEqualTo(400);
  }

  @Test
  void onlyAdminsReachAdminEndpoints() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var graceId = idOf(admin, "grace");

    assertThat(grace.get("/api/v1/users").statusCode()).isEqualTo(403);
    assertThat(
            grace.post("/api/v1/users", "{\"username\":\"x1x\",\"role\":\"ADMIN\"}").statusCode())
        .isEqualTo(403);
    assertThat(grace.post("/api/v1/users/" + graceId + "/deactivate", "").statusCode())
        .isEqualTo(403);
    assertThat(grace.post("/api/v1/users/" + graceId + "/invite", "").statusCode()).isEqualTo(403);
    assertThat(new Session(port).get("/api/v1/users").statusCode()).isEqualTo(401);
    assertThat(admin.get("/api/v1/users").statusCode()).isEqualTo(200);
  }

  @Test
  void deactivatingEndsSessionsAndBlocksLoginUntilRestored() throws Exception {
    var admin = admin();
    var grace = member(admin, "grace");
    var cookie = grace.sessionCookie();
    var graceId = idOf(admin, "grace");
    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", cookie).statusCode()).isEqualTo(200);

    assertThat(admin.post("/api/v1/users/" + graceId + "/deactivate", "").statusCode())
        .isEqualTo(204);

    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", cookie).statusCode()).isEqualTo(401);
    assertThat(admin.get("/api/v1/users").body()).contains("\"status\":\"DEACTIVATED\"");
    var login =
        new Session(port)
            .post(
                "/api/v1/auth/login", "{\"username\":\"grace\",\"password\":\"" + PASSWORD + "\"}");
    assertThat(login.statusCode()).isEqualTo(401);

    assertThat(admin.post("/api/v1/users/" + graceId + "/activate", "").statusCode())
        .isEqualTo(204);
    var again =
        new Session(port)
            .post(
                "/api/v1/auth/login", "{\"username\":\"grace\",\"password\":\"" + PASSWORD + "\"}");
    assertThat(again.statusCode()).isEqualTo(200);
  }

  @Test
  void anAdminCannotDeactivateThemselvesAndMissingUsersAre404() throws Exception {
    var admin = admin();
    var self = idOf(admin, "admin");

    assertThat(admin.post("/api/v1/users/" + self + "/deactivate", "").statusCode()).isEqualTo(409);
    assertThat(admin.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
    var nobody = "00000000-0000-0000-0000-000000000000";
    assertThat(admin.post("/api/v1/users/" + nobody + "/deactivate", "").statusCode())
        .isEqualTo(404);
    assertThat(admin.post("/api/v1/users/" + nobody + "/activate", "").statusCode()).isEqualTo(404);
    assertThat(admin.post("/api/v1/users/" + nobody + "/invite", "").statusCode()).isEqualTo(404);
  }

  @Test
  void aNewInviteReplacesTheOldOneAndOnlyPendingUsersGetOne() throws Exception {
    var admin = admin();
    var first = invite(admin, "grace", "USER");
    var graceId = idOf(admin, "grace");

    var reissued = admin.post("/api/v1/users/" + graceId + "/invite", "");
    assertThat(reissued.statusCode()).isEqualTo(200);
    var second = tokenIn(reissued.body());

    assertThat(second).isNotEqualTo(first);
    assertThat(new Session(port).get("/api/v1/invites/" + first).statusCode()).isEqualTo(404);
    assertThat(new Session(port).get("/api/v1/invites/" + second).statusCode()).isEqualTo(200);

    new Session(port)
        .post("/api/v1/invites/" + second + "/accept", "{\"password\":\"" + PASSWORD + "\"}");
    assertThat(admin.post("/api/v1/users/" + graceId + "/invite", "").statusCode()).isEqualTo(409);
  }

  @Test
  void invitesAreStoredHashedNotInTheClear() throws Exception {
    var token = invite(admin(), "grace", "USER");

    var stored = jdbc.queryForObject("select token_hash from invites", String.class);

    assertThat(stored).isNotEqualTo(token).doesNotContain(token);
  }

  @Test
  void changingYourPasswordNeedsTheCurrentOneAndEndsOtherSessions() throws Exception {
    var admin = admin();
    var here = member(admin, "grace");
    var elsewhere = new Session(port);
    elsewhere.post(
        "/api/v1/auth/login", "{\"username\":\"grace\",\"password\":\"" + PASSWORD + "\"}");
    var elsewhereCookie = elsewhere.sessionCookie();
    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", elsewhereCookie).statusCode())
        .isEqualTo(200);

    var wrong =
        here.post(
            "/api/v1/auth/password",
            "{\"currentPassword\":\"not it at all!\",\"newPassword\":\"a brand new password\"}");
    var weak =
        here.post(
            "/api/v1/auth/password",
            "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"short\"}");
    assertThat(wrong.statusCode()).isEqualTo(400);
    assertThat(wrong.body()).contains("Current password is incorrect");
    assertThat(weak.statusCode()).isEqualTo(400);
    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", elsewhereCookie).statusCode())
        .isEqualTo(200);

    var changed =
        here.post(
            "/api/v1/auth/password",
            "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"a brand new password\"}");

    assertThat(changed.statusCode()).isEqualTo(204);
    assertThat(here.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
    assertThat(Session.getWithCookie(port, "/api/v1/auth/me", elsewhereCookie).statusCode())
        .isEqualTo(401);
    assertThat(
            new Session(port)
                .post(
                    "/api/v1/auth/login",
                    "{\"username\":\"grace\",\"password\":\"" + PASSWORD + "\"}")
                .statusCode())
        .isEqualTo(401);
    assertThat(
            new Session(port)
                .post(
                    "/api/v1/auth/login",
                    "{\"username\":\"grace\",\"password\":\"a brand new password\"}")
                .statusCode())
        .isEqualTo(200);
  }

  @Test
  void changingPasswordRequiresALogin() throws Exception {
    var response =
        new Session(port)
            .post(
                "/api/v1/auth/password",
                "{\"currentPassword\":\"x\",\"newPassword\":\"a brand new password\"}");

    assertThat(response.statusCode()).isEqualTo(401);
  }

  @Test
  void thereIsNoOtherWayToRegister() throws Exception {
    admin();

    var anonymous =
        new Session(port).post("/api/v1/users", "{\"username\":\"sneaky\",\"role\":\"ADMIN\"}");
    var setup =
        new Session(port)
            .post(
                "/api/v1/setup",
                "{\"username\":\"sneaky\",\"password\":\"a long enough password\"}");

    assertThat(anonymous.statusCode()).isEqualTo(401);
    assertThat(setup.statusCode()).isEqualTo(409);
    assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isEqualTo(1);
  }
}
