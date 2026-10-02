package dev.ossm.api.auth;

import dev.ossm.api.users.Role;
import dev.ossm.api.users.UserAccount;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Wire types for setup and auth. Names here become the schema names in contract/openapi.yaml. */
final class Dtos {

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
          @Pattern(
              regexp = "^[a-z0-9._-]+$",
              message =
                  "Username may only use lowercase letters, digits, dots, dashes and underscores")
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

  /** Documents the RFC 9457 body that error responses carry; never instantiated. */
  @Schema(description = "RFC 9457 problem details")
  record Problem(String type, String title, Integer status, String detail, String instance) {}
}
