package dev.ossm.api.users;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The users module's public face: everything else asks this, never the repository. */
@Service
public class Accounts {

  /** Serialises first-run setup so two simultaneous requests cannot both create an admin. */
  private static final String SETUP_LOCK =
      "select count(*) from (select pg_advisory_xact_lock(4101)) as lock";

  private final UserAccountRepository users;
  private final Invites invites;
  private final PasswordEncoder encoder;
  private final EntityManager entityManager;

  /** Checked against when the login cannot succeed, so a miss costs as much as a wrong password. */
  private final String decoyHash;

  Accounts(
      UserAccountRepository users,
      Invites invites,
      PasswordEncoder encoder,
      EntityManager entityManager) {
    this.users = users;
    this.invites = invites;
    this.encoder = encoder;
    this.entityManager = entityManager;
    this.decoyHash = encoder.encode(UUID.randomUUID().toString());
  }

  public record Invited(UserAccount account, String token, Instant expiresAt) {}

  public static class UsernameTakenException extends RuntimeException {
    public UsernameTakenException() {
      super("That username is already taken.");
    }
  }

  public static class AlreadyJoinedException extends RuntimeException {
    public AlreadyJoinedException() {
      super("This person has already set a password.");
    }
  }

  @Transactional(readOnly = true)
  public boolean setupRequired() {
    return users.count() == 0;
  }

  /** Creates the first admin, or returns empty if any user already exists. */
  @Transactional
  public Optional<UserAccount> createAdminIfNoUsers(String username, String password) {
    entityManager.createNativeQuery(SETUP_LOCK).getSingleResult();
    if (users.count() > 0) {
      return Optional.empty();
    }
    return Optional.of(
        users.save(new UserAccount(normalize(username), encoder.encode(password), Role.ADMIN)));
  }

  @Transactional(readOnly = true)
  public Optional<UserAccount> authenticate(String username, String password) {
    var found = users.findByUsername(normalize(username)).filter(UserAccount::canLogIn);
    var matches =
        encoder.matches(password, found.map(UserAccount::getPasswordHash).orElse(decoyHash));
    return found.filter(account -> matches);
  }

  @Transactional(readOnly = true)
  public Optional<UserAccount> findActive(String username) {
    return users.findByUsername(normalize(username)).filter(UserAccount::isActive);
  }

  @Transactional(readOnly = true)
  public List<UserAccount> list() {
    return users.findAll(Sort.by("createdAt", "username"));
  }

  /** Creates a pending account and a one-time link; the person picks their own password. */
  @Transactional
  public Invited invite(String username, Role role) {
    var name = normalize(username);
    if (users.findByUsername(name).isPresent()) {
      throw new UsernameTakenException();
    }
    try {
      var account = users.saveAndFlush(new UserAccount(name, null, role));
      var issued = invites.issue(account.getId());
      return new Invited(account, issued.token(), issued.expiresAt());
    } catch (DataIntegrityViolationException e) {
      throw new UsernameTakenException();
    }
  }

  @Transactional
  public Optional<Invited> reissueInvite(UUID userId) {
    return users
        .findById(userId)
        .map(
            account -> {
              if (account.getPasswordHash() != null) {
                throw new AlreadyJoinedException();
              }
              var issued = invites.issue(account.getId());
              return new Invited(account, issued.token(), issued.expiresAt());
            });
  }

  /** Empty when there is no such user. */
  @Transactional
  public Optional<UserAccount> setActive(UUID userId, boolean active) {
    return users
        .findById(userId)
        .map(
            account -> {
              account.setActive(active);
              return account;
            });
  }

  @Transactional(readOnly = true)
  public Optional<String> inviteeUsername(String token) {
    return invites
        .peek(token)
        .flatMap(users::findById)
        .filter(UserAccount::isActive)
        .map(UserAccount::getUsername);
  }

  /** Spends the invite and sets the password. Empty if the token is unusable. */
  @Transactional
  public Optional<UserAccount> acceptInvite(String token, String password) {
    return invites
        .consume(token)
        .flatMap(users::findById)
        .filter(UserAccount::isActive)
        .filter(account -> account.getPasswordHash() == null)
        .map(
            account -> {
              account.setPasswordHash(encoder.encode(password));
              return account;
            });
  }

  /** Returns false, changing nothing, when the current password is wrong. */
  @Transactional
  public boolean changePassword(String username, String current, String replacement) {
    var account = users.findByUsername(normalize(username)).filter(UserAccount::canLogIn);
    var matches =
        encoder.matches(current, account.map(UserAccount::getPasswordHash).orElse(decoyHash));
    if (account.isEmpty() || !matches) {
      return false;
    }
    account.get().setPasswordHash(encoder.encode(replacement));
    return true;
  }

  private static String normalize(String username) {
    return username.strip().toLowerCase(Locale.ROOT);
  }
}
