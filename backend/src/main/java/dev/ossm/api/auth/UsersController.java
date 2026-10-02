package dev.ossm.api.auth;

import dev.ossm.api.auth.Dtos.CreateUserRequest;
import dev.ossm.api.auth.Dtos.InviteCreated;
import dev.ossm.api.auth.Dtos.Problem;
import dev.ossm.api.auth.Dtos.UserSummary;
import dev.ossm.api.users.Accounts;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin-only user management. SecurityConfig restricts every route under /api/v1/users. */
@RestController
@RequestMapping("/api/v1/users")
class UsersController {

  private final Accounts accounts;
  private final SessionRevoker revoker;

  UsersController(Accounts accounts, SessionRevoker revoker) {
    this.accounts = accounts;
    this.revoker = revoker;
  }

  @Operation(operationId = "listUsers")
  @GetMapping
  List<UserSummary> list() {
    return accounts.list().stream().map(UserSummary::of).toList();
  }

  @Operation(operationId = "createUser")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Pending account created"),
    @ApiResponse(
        responseCode = "400",
        description = "Invalid username or role",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "Username already taken",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  InviteCreated create(@Valid @RequestBody CreateUserRequest body) {
    return InviteCreated.of(accounts.invite(body.username(), body.role()));
  }

  @Operation(operationId = "reissueInvite")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Fresh invite"),
    @ApiResponse(
        responseCode = "404",
        description = "No such user",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "The user already has a password",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/{id}/invite")
  InviteCreated reissueInvite(@PathVariable UUID id) {
    return accounts
        .reissueInvite(id)
        .map(InviteCreated::of)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user."));
  }

  @Operation(operationId = "deactivateUser")
  @ApiResponses({
    @ApiResponse(responseCode = "204", description = "Deactivated"),
    @ApiResponse(
        responseCode = "404",
        description = "No such user",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "409",
        description = "You cannot deactivate yourself",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/{id}/deactivate")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void deactivate(@PathVariable UUID id, Authentication caller) {
    var me = accounts.findActive(caller.getName());
    if (me.isPresent() && me.get().getId().equals(id)) {
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "You can't deactivate your own account.");
    }
    var target =
        accounts
            .setActive(id, false)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user."));
    revoker.revokeAll(target.getUsername());
  }

  @Operation(operationId = "activateUser")
  @ApiResponses({
    @ApiResponse(responseCode = "204", description = "Activated"),
    @ApiResponse(
        responseCode = "404",
        description = "No such user",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/{id}/activate")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void activate(@PathVariable UUID id) {
    accounts
        .setActive(id, true)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user."));
  }
}
