package dev.ossm.api.users;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserAccount {

  @Id private UUID id;

  @Column(nullable = false)
  private String username;

  /** Null while the person has been invited but has not chosen a password yet. */
  @Column(name = "password_hash")
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Role role;

  @Column(nullable = false)
  private boolean active;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected UserAccount() {}

  UserAccount(String username, String passwordHash, Role role) {
    this.id = UUID.randomUUID();
    this.username = username;
    this.passwordHash = passwordHash;
    this.role = role;
    this.active = true;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getUsername() {
    return username;
  }

  String getPasswordHash() {
    return passwordHash;
  }

  void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public Role getRole() {
    return role;
  }

  public boolean isActive() {
    return active;
  }

  void setActive(boolean active) {
    this.active = active;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public UserStatus getStatus() {
    if (!active) {
      return UserStatus.DEACTIVATED;
    }
    return passwordHash == null ? UserStatus.INVITED : UserStatus.ACTIVE;
  }

  /** Whether this account may log in: active and past the invite stage. */
  boolean canLogIn() {
    return active && passwordHash != null;
  }
}
