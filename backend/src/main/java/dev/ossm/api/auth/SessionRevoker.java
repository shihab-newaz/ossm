package dev.ossm.api.auth;

import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.stereotype.Component;

/** Ends sessions server-side, so a cookie that was already handed out stops working at once. */
@Component
class SessionRevoker {

  private final FindByIndexNameSessionRepository<?> sessions;

  SessionRevoker(FindByIndexNameSessionRepository<?> sessions) {
    this.sessions = sessions;
  }

  void revokeAll(String username) {
    sessions.findByPrincipalName(username).keySet().forEach(sessions::deleteById);
  }

  void revokeAllExcept(String username, String keepSessionId) {
    sessions.findByPrincipalName(username).keySet().stream()
        .filter(id -> !id.equals(keepSessionId))
        .forEach(sessions::deleteById);
  }
}
