package dev.ossm.api;

import org.springframework.jdbc.core.JdbcTemplate;

public final class AuthTestSupport {

  static final String ADMIN_SETUP =
      "{\"username\":\"admin\",\"password\":\"correct horse battery\"}";

  private AuthTestSupport() {}

  /**
   * Back to a fresh instance: no users, no sessions. The shared container outlives test classes.
   */
  public static void resetInstance(JdbcTemplate jdbc) {
    // A previous test's ingest job may still be running on a scheduler thread. Let it finish
    // rather than truncate underneath it (which can deadlock), and retry if it still collides.
    var deadline = System.nanoTime() + java.time.Duration.ofSeconds(15).toNanos();
    while (System.nanoTime() < deadline
        && jdbc.queryForObject("select count(*) from scheduled_tasks where picked", Integer.class)
            > 0) {
      sleep(100);
    }
    for (int attempt = 1; ; attempt++) {
      try {
        jdbc.execute(
            "TRUNCATE scheduled_tasks, upload, track, album, artist, spring_session,"
                + " spring_session_attributes, users CASCADE");
        return;
      } catch (org.springframework.dao.PessimisticLockingFailureException e) {
        if (attempt >= 5) {
          throw e;
        }
        sleep(200L * attempt);
      }
    }
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
