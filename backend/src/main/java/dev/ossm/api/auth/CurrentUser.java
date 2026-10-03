package dev.ossm.api.auth;

import dev.ossm.api.users.Accounts;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Resolves the logged-in account for controllers outside the auth module. */
@Component
public class CurrentUser {

  private final Accounts accounts;

  CurrentUser(Accounts accounts) {
    this.accounts = accounts;
  }

  public UUID id(Authentication authentication) {
    return accounts
        .findActive(authentication.getName())
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "You are not logged in."))
        .getId();
  }
}
