package dev.ossm.api.auth;

import dev.ossm.api.users.UserAccount;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/** Turns a verified account into a logged-in session stored by Spring Session. */
@Component
class SessionStarter {

  private final SecurityContextRepository repository;
  private final SecurityContextHolderStrategy holder =
      SecurityContextHolder.getContextHolderStrategy();

  SessionStarter(SecurityContextRepository repository) {
    this.repository = repository;
  }

  void start(UserAccount account, HttpServletRequest request, HttpServletResponse response) {
    // A session id presented before login must not survive it (session fixation).
    if (request.getSession(false) != null) {
      request.changeSessionId();
    }
    // The principal is just the username: it serialises into the session row and the current
    // account (role, active flag) is always read fresh from the database.
    var authentication =
        UsernamePasswordAuthenticationToken.authenticated(
            account.getUsername(),
            null,
            List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole().name())));
    var context = holder.createEmptyContext();
    context.setAuthentication(authentication);
    holder.setContext(context);
    repository.saveContext(context, request, response);
  }

  void end(HttpServletRequest request) {
    var session = request.getSession(false);
    if (session != null) {
      session.invalidate();
    }
    holder.clearContext();
  }
}
