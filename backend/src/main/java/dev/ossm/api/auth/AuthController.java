package dev.ossm.api.auth;

import dev.ossm.api.auth.Dtos.ChangePasswordRequest;
import dev.ossm.api.auth.Dtos.LoginRequest;
import dev.ossm.api.auth.Dtos.SetupRequest;
import dev.ossm.api.auth.Dtos.SetupStatus;
import dev.ossm.api.auth.Dtos.User;
import dev.ossm.api.users.Accounts;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
class AuthController {

  private final Accounts accounts;
  private final SessionStarter sessions;
  private final SessionRevoker revoker;

  AuthController(Accounts accounts, SessionStarter sessions, SessionRevoker revoker) {
    this.accounts = accounts;
    this.sessions = sessions;
    this.revoker = revoker;
  }

  @Operation(operationId = "getSetupStatus")
  @GetMapping("/setup")
  SetupStatus setupStatus() {
    return new SetupStatus(accounts.setupRequired());
  }

  @Operation(operationId = "completeSetup")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Admin created and logged in"),
    @ApiResponse(
        responseCode = "400",
        description = "Invalid username or password",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "Setup is already complete",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/setup")
  @ResponseStatus(HttpStatus.CREATED)
  User completeSetup(
      @Valid @RequestBody SetupRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    var admin =
        accounts
            .createAdminIfNoUsers(body.username(), body.password())
            .orElseThrow(
                () ->
                    new ResponseStatusException(HttpStatus.CONFLICT, "Setup is already complete."));
    sessions.start(admin, request, response);
    return User.of(admin);
  }

  @Operation(operationId = "login")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Logged in"),
    @ApiResponse(
        responseCode = "400",
        description = "Missing username or password",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "401",
        description = "Incorrect username or password",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/auth/login")
  User login(
      @Valid @RequestBody LoginRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    var account =
        accounts
            .authenticate(body.username(), body.password())
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Incorrect username or password."));
    sessions.start(account, request, response);
    return User.of(account);
  }

  @Operation(operationId = "logout")
  @ApiResponse(responseCode = "204", description = "Logged out")
  @PostMapping("/auth/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void logout(HttpServletRequest request) {
    sessions.end(request);
  }

  @Operation(operationId = "changePassword")
  @ApiResponses({
    @ApiResponse(responseCode = "204", description = "Password changed"),
    @ApiResponse(
        responseCode = "400",
        description = "Wrong current password, or the new one is not acceptable",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/auth/password")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void changePassword(
      @Valid @RequestBody ChangePasswordRequest body,
      Authentication authentication,
      HttpServletRequest request) {
    var username = authentication.getName();
    if (!accounts.changePassword(username, body.currentPassword(), body.newPassword())) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect.");
    }
    // Anyone holding an older session (a stolen cookie, a forgotten device) is logged out.
    revoker.revokeAllExcept(username, request.getSession().getId());
  }

  @Operation(operationId = "getCurrentUser")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The current user"),
    @ApiResponse(
        responseCode = "401",
        description = "No valid session",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/auth/me")
  User currentUser(Authentication authentication, HttpServletRequest request) {
    return accounts
        .findActive(authentication.getName())
        .map(User::of)
        .orElseThrow(
            () -> {
              // The account was removed or deactivated after this session was created.
              sessions.end(request);
              return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "You are not logged in.");
            });
  }
}
