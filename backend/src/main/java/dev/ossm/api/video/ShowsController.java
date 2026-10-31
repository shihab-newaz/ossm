package dev.ossm.api.video;

import dev.ossm.api.auth.CurrentUser;
import dev.ossm.api.video.VideoDtos.Show;
import dev.ossm.api.video.VideoDtos.ShowDetail;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Shows and their seasons. Login required. */
@RestController
@RequestMapping("/api/v1/shows")
class ShowsController {

  private final VideoQueries queries;
  private final CurrentUser currentUser;

  ShowsController(VideoQueries queries, CurrentUser currentUser) {
    this.queries = queries;
    this.currentUser = currentUser;
  }

  @Operation(operationId = "listShows", summary = "Shows in the shared library")
  @ApiResponses(
      @ApiResponse(
          responseCode = "200",
          description = "Shows",
          headers = @Header(name = "X-Total-Count", description = "How many there are in all")))
  @GetMapping
  ResponseEntity<List<Show>> list(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset,
      @RequestParam(defaultValue = "added") String sort,
      Authentication authentication) {
    var shows =
        queries.shows(currentUser.id(authentication), sort, VideosController.paging(limit, offset));
    return ResponseEntity.ok()
        .header("X-Total-Count", Long.toString(queries.showCount()))
        .body(shows);
  }

  @Operation(operationId = "getShow", summary = "A show and its episodes by season")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The show"),
    @ApiResponse(
        responseCode = "404",
        description = "No such show",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/{id}")
  ShowDetail get(@PathVariable UUID id, Authentication authentication) {
    return queries
        .showDetail(currentUser.id(authentication), id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such show."));
  }
}
