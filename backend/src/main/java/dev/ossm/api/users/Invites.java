package dev.ossm.api.users;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** One-time invite tokens. Only a hash is stored; the token itself is shown once. */
@Component
class Invites {

  static final Duration LIFETIME = Duration.ofDays(7);

  private final JdbcClient jdbc;
  private final SecureRandom random = new SecureRandom();

  Invites(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  record Issued(String token, Instant expiresAt) {}

  /** Issues a fresh token for the user, replacing any earlier one. */
  Issued issue(UUID userId) {
    jdbc.sql("delete from invites where user_id = :user").param("user", userId).update();
    var bytes = new byte[32];
    random.nextBytes(bytes);
    var token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    var expiresAt = Instant.now().plus(LIFETIME);
    jdbc.sql(
            "insert into invites (id, user_id, token_hash, expires_at)"
                + " values (:id, :user, :hash, :expires)")
        .param("id", UUID.randomUUID())
        .param("user", userId)
        .param("hash", hash(token))
        .param("expires", java.sql.Timestamp.from(expiresAt))
        .update();
    return new Issued(token, expiresAt);
  }

  /** The user a still-valid token belongs to, without spending it. */
  Optional<UUID> peek(String token) {
    return jdbc.sql("select user_id from invites where token_hash = :hash and expires_at > now()")
        .param("hash", hash(token))
        .query(UUID.class)
        .optional();
  }

  /** Spends a valid token atomically; two concurrent accepts cannot both win. */
  Optional<UUID> consume(String token) {
    return jdbc.sql(
            "delete from invites where token_hash = :hash and expires_at > now()"
                + " returning user_id")
        .param("hash", hash(token))
        .query(UUID.class)
        .optional();
  }

  private static String hash(String token) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
