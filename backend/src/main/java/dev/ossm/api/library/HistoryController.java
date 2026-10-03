package dev.ossm.api.library;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.library.LibraryController.Track;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the signed-in user listened to, derived from their qualifying plays (play_completed).
 * Everything here is scoped to the session's user; nobody sees anyone else's listening.
 */
@RestController
@RequestMapping("/api/v1")
class HistoryController {

  private static final int DEFAULT_LIMIT = 50;
  private static final int MAX_LIMIT = 200;

  record Play(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Track track,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant playedAt) {}

  record MostPlayed(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Track track,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long plays) {}

  private final JdbcClient jdbc;
  private final CurrentUser currentUser;

  HistoryController(JdbcClient jdbc, CurrentUser currentUser) {
    this.jdbc = jdbc;
    this.currentUser = currentUser;
  }

  @Operation(
      operationId = "listHistory",
      summary = "Your recent plays, newest first",
      description = "One entry per qualifying play, so a track played twice appears twice.")
  @GetMapping("/history")
  List<Play> history(
      @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit, Authentication authentication) {
    var userId = currentUser.id(authentication);
    return jdbc.sql(
            "select "
                + LibraryController.TRACK_COLUMNS
                + ", e.occurred_at as played_at"
                + LibraryController.TRACK_JOINS
                + " join play_event e on e.track_id = t.id"
                + " where e.user_id = :user and e.type = 'play_completed'"
                + " order by e.occurred_at desc, e.seq desc limit :limit")
        .param("user", userId)
        .param("limit", clamp(limit))
        .query(
            (rs, i) ->
                new Play(
                    LibraryController.track(rs),
                    rs.getObject("played_at", OffsetDateTime.class).toInstant()))
        .list();
  }

  @Operation(
      operationId = "listMostPlayed",
      summary = "Your most played tracks",
      description = "Counts your qualifying plays per track, highest first.")
  @GetMapping("/history/most-played")
  List<MostPlayed> mostPlayed(
      @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit, Authentication authentication) {
    var userId = currentUser.id(authentication);
    return jdbc.sql(
            "select "
                + LibraryController.TRACK_COLUMNS
                + ", p.plays"
                + LibraryController.TRACK_JOINS
                + " join (select track_id, count(*) as plays, max(occurred_at) as last_played"
                + " from play_event where user_id = :user and type = 'play_completed'"
                + " group by track_id) p on p.track_id = t.id"
                + " order by p.plays desc, p.last_played desc, t.title limit :limit")
        .param("user", userId)
        .param("limit", clamp(limit))
        .query((rs, i) -> new MostPlayed(LibraryController.track(rs), rs.getLong("plays")))
        .list();
  }

  private static int clamp(int limit) {
    return Math.max(1, Math.min(limit, MAX_LIMIT));
  }
}
