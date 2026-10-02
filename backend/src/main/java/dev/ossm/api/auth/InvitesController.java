package dev.ossm.api.auth;

import dev.ossm.api.auth.Dtos.AcceptInviteRequest;
import dev.ossm.api.auth.Dtos.InviteInfo;
import dev.ossm.api.auth.Dtos.Problem;
import dev.ossm.api.auth.Dtos.User;
import dev.ossm.api.users.Accounts;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Public: the invite token is the credential. */
@RestController
@RequestMapping("/api/v1/invites")
class InvitesController {

  private static final String GONE = "This invite link is not valid or has expired.";

  private final Accounts accounts;
  private final SessionStarter sessions;

  InvitesController(Accounts accounts, SessionStarter sessions) {
    this.accounts = accounts;
    this.sessions = sessions;
  }

  @Operation(operationId = "getInvite")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "A usable invite"),
    @ApiResponse(
        responseCode = "404",
        description = "Invalid, used or expired",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{token}")
  InviteInfo get(@PathVariable String token) {
    return accounts
        .inviteeUsername(token)
        .map(InviteInfo::new)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, GONE));
  }

  @Operation(operationId = "acceptInvite")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Account active and logged in"),
    @ApiResponse(
        responseCode = "400",
        description = "Password not acceptable",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class))),
    @ApiResponse(
        responseCode = "404",
        description = "Invalid, used or expired",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PostMapping("/{token}/accept")
  @ResponseStatus(HttpStatus.CREATED)
  User accept(
      @PathVariable String token,
      @Valid @RequestBody AcceptInviteRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    var account =
        accounts
            .acceptInvite(token, body.password())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, GONE));
    sessions.start(account, request, response);
    return User.of(account);
  }
}
