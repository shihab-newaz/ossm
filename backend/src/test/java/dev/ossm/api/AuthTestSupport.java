package dev.ossm.api;

import org.springframework.jdbc.core.JdbcTemplate;

final class AuthTestSupport {

  static final String ADMIN_SETUP =
      "{\"username\":\"admin\",\"password\":\"correct horse battery\"}";

  private AuthTestSupport() {}

  /**
   * Back to a fresh instance: no users, no sessions. The shared container outlives test classes.
   */
  static void resetInstance(JdbcTemplate jdbc) {
    jdbc.execute("TRUNCATE spring_session, spring_session_attributes, users CASCADE");
  }
}
