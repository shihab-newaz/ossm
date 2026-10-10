package dev.ossm.api.library;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.library.LibraryController.Track;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The signed-in user's liked tracks. Everything here is scoped to the session's user; nobody sees
 * anyone else's likes.
 */
@RestController
@RequestMapping("/api/v1/favorites")
class FavoritesController {

  private final JdbcClient jdbc;
  private final CurrentUser currentUser;

  FavoritesController(JdbcClient jdbc, CurrentUser currentUser) {
    this.jdbc = jdbc;
    this.currentUser = currentUser;
  }

  @Operation(
      operationId = "listFavorites",
      summary = "Your liked tracks, most recently liked first",
      description =
          "Everything unless limit and offset are given. Only yours. The total is in"
              + " X-Total-Count.")
  @ApiResponses(
      @ApiResponse(
          responseCode = "200",
          description = "Liked tracks",
          headers = @Header(name = "X-Total-Count", schema = @Schema(type = "integer"))))
  @GetMapping
  ResponseEntity<List<Track>> favorites(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset,
      Authentication authentication) {
    var userId = currentUser.id(authentication);
    var total =
        jdbc.sql("select count(*) from favorite where user_id = :user")
            .param("user", userId)
            .query(Long.class)
            .single();
    var items =
        jdbc.sql(
                "select "
                    + LibraryController.TRACK_COLUMNS
                    + LibraryController.TRACK_JOINS
                    + " join favorite f on f.track_id = t.id"
                    + " where f.user_id = :user"
                    + " order by f.created_at desc, t.id"
                    + Paging.clause(limit, offset))
            .param("user", userId)
            .query((rs, i) -> LibraryController.track(rs))
            .list();
    return ResponseEntity.ok().header("X-Total-Count", String.valueOf(total)).body(items);
  }

  @Operation(
      operationId = "listFavoriteIds",
      summary = "The ids of every track you have liked",
      description =
          "Small and cheap, so a client can keep it and show the like state of any track it has"
              + " on screen.")
  @GetMapping("/ids")
  List<UUID> ids(Authentication authentication) {
    return jdbc.sql("select track_id from favorite where user_id = :user")
        .param("user", currentUser.id(authentication))
        .query(UUID.class)
        .list();
  }

  @Operation(
      operationId = "likeTrack",
      summary = "Like a track",
      description = "Liking a track you already like changes nothing.")
  @ApiResponses({
    @ApiResponse(responseCode = "204", description = "Liked"),
    @ApiResponse(
        responseCode = "404",
        description = "No such track",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @PutMapping("/{trackId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void like(@PathVariable UUID trackId, Authentication authentication) {
    var userId = currentUser.id(authentication);
    var exists =
        jdbc.sql("select exists (select 1 from track where id = :track)")
            .param("track", trackId)
            .query(Boolean.class)
            .single();
    if (!exists) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such track.");
    }
    try {
      jdbc.sql(
              "insert into favorite (user_id, track_id) values (:user, :track)"
                  + " on conflict do nothing")
          .param("user", userId)
          .param("track", trackId)
          .update();
    } catch (DataIntegrityViolationException gone) {
      // Deleted between the check and the insert.
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such track.");
    }
  }

  @Operation(
      operationId = "unlikeTrack",
      summary = "Unlike a track",
      description = "Unliking a track you do not like changes nothing.")
  @ApiResponse(responseCode = "204", description = "No longer liked")
  @DeleteMapping("/{trackId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void unlike(@PathVariable UUID trackId, Authentication authentication) {
    jdbc.sql("delete from favorite where user_id = :user and track_id = :track")
        .param("user", currentUser.id(authentication))
        .param("track", trackId)
        .update();
  }
}
