package dev.ossm.api.users;

import jakarta.persistence.EntityManager;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
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
  private final PasswordEncoder encoder;
  private final EntityManager entityManager;

  /** Checked against when the username is unknown, so a miss costs as much as a wrong password. */
  private final String decoyHash;

  Accounts(UserAccountRepository users, PasswordEncoder encoder, EntityManager entityManager) {
    this.users = users;
    this.encoder = encoder;
    this.entityManager = entityManager;
    this.decoyHash = encoder.encode(UUID.randomUUID().toString());
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
    var found = users.findByUsername(normalize(username)).filter(UserAccount::isActive);
    var matches =
        encoder.matches(password, found.map(UserAccount::getPasswordHash).orElse(decoyHash));
    return found.filter(account -> matches);
  }

  @Transactional(readOnly = true)
  public Optional<UserAccount> findActive(String username) {
    return users.findByUsername(normalize(username)).filter(UserAccount::isActive);
  }

  private static String normalize(String username) {
    return username.strip().toLowerCase(Locale.ROOT);
  }
}
