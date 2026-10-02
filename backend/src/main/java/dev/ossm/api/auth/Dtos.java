package dev.ossm.api.auth;

import dev.ossm.api.users.Accounts;
import dev.ossm.api.users.Role;
import dev.ossm.api.users.UserAccount;
import dev.ossm.api.users.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Wire types for setup and auth. Names here become the schema names in contract/openapi.yaml. */
final class Dtos {

  private static final String USERNAME_RULE = "^[a-z0-9._-]+$";
  private static final String USERNAME_MESSAGE =
      "Username may only use lowercase letters, digits, dots, dashes and underscores";

  private Dtos() {}

  record User(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String username,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Role role) {

    static User of(UserAccount account) {
      return new User(account.getId(), account.getUsername(), account.getRole());
    }
  }

  record SetupStatus(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean setupRequired) {}

  record SetupRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @Size(min = 3, max = 32, message = "Username must be 3 to 32 characters")
          @Pattern(regexp = USERNAME_RULE, message = USERNAME_MESSAGE)
          String username,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "password")
          @Size(min = 12, max = 128, message = "Password must be 12 to 128 characters")
          String password) {}

  record LoginRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @NotBlank(message = "Enter your username")
          String username,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "password")
          @NotBlank(message = "Enter your password")
          String password) {}

  record UserSummary(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String username,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Role role,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UserStatus status,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {

    static UserSummary of(UserAccount account) {
      return new UserSummary(
          account.getId(),
          account.getUsername(),
          account.getRole(),
          account.getStatus(),
          account.getCreatedAt());
    }
  }

  record CreateUserRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
          @Size(min = 3, max = 32, message = "Username must be 3 to 32 characters")
          @Pattern(regexp = USERNAME_RULE, message = USERNAME_MESSAGE)
          String username,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotNull(message = "Choose a role")
          Role role) {}

  record InviteCreated(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UserSummary user,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String token,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant expiresAt) {

    static InviteCreated of(Accounts.Invited invited) {
      return new InviteCreated(
          UserSummary.of(invited.account()), invited.token(), invited.expiresAt());
    }
  }

  record InviteInfo(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String username) {}

  record AcceptInviteRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "password")
          @Size(min = 12, max = 128, message = "Password must be 12 to 128 characters")
          String password) {}

  record ChangePasswordRequest(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "password")
          @NotBlank(message = "Enter your current password")
          String currentPassword,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "password")
          @Size(min = 12, max = 128, message = "New password must be 12 to 128 characters")
          String newPassword) {}

  /** Documents the RFC 9457 body that error responses carry; never instantiated. */
  @Schema(description = "RFC 9457 problem details")
  record Problem(String type, String title, Integer status, String detail, String instance) {}
}
