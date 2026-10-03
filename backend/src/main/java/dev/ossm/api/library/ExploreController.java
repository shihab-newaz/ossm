package dev.ossm.api.library;

import dev.ossm.api.library.BrowseController.Album;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the Explore page is built from, all of it from the shared library. Every route needs a
 * login.
 */
@RestController
@RequestMapping("/api/v1")
class ExploreController {

  record Genre(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "As most tracks spell it")
          String name,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Stable lower-case id: use it in links and to pick the tile colour")
          String slug,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int trackCount,
      @Schema(description = "Cover of an album with tracks in this genre, when one has a cover")
          String coverUrl) {}

  private static final int DEFAULT_LIMIT = 12;
  private static final int MAX_LIMIT = 50;

  private final JdbcClient jdbc;

  ExploreController(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Operation(
      operationId = "listGenres",
      summary = "Genres present in the library",
      description =
          "Built from the genre tags of the tracks, so there are no empty genres. Spellings that"
              + " differ only in case, spacing or punctuation are one genre. Most tracks first.")
  @GetMapping("/genres")
  List<Genre> genres() {
    var slug = Genres.slug("t.genre");
    return jdbc.sql(
            "with g as (select t.album_id, t.created_at, trim(t.genre) as genre, "
                + slug
                + " as slug from track t where t.genre is not null)"
                + " select g.slug, mode() within group (order by g.genre) as name,"
                + " count(*) as track_count,"
                + " (select al.id from g g2 join album al on al.id = g2.album_id"
                + " where g2.slug = g.slug and al.cover_key is not null"
                + " order by g2.created_at desc, al.id limit 1) as cover_album"
                + " from g where g.slug <> '' group by g.slug"
                + " order by track_count desc, lower(mode() within group (order by g.genre)),"
                + " g.slug")
        .query(
            (rs, i) -> {
              var cover = rs.getObject("cover_album", UUID.class);
              return new Genre(
                  rs.getString("name"),
                  rs.getString("slug"),
                  rs.getInt("track_count"),
                  cover == null ? null : "/api/v1/albums/" + cover + "/cover");
            })
        .list();
  }

  @Operation(
      operationId = "listRecentlyAdded",
      summary = "Albums by when their newest track was added",
      description =
          "Newest first. An album climbs back to the top when a track is added to it. Tracks"
              + " without an album are not included.")
  @GetMapping("/albums/recent")
  List<Album> recentlyAdded(@RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {
    return jdbc.sql(
            BrowseController.ALBUM_SELECT
                + BrowseController.ALBUM_GROUP
                + " order by max(t.created_at) desc nulls last, al.id limit :limit")
        .param("limit", Math.max(1, Math.min(limit, MAX_LIMIT)))
        .query((rs, i) -> BrowseController.album(rs))
        .list();
  }

  @Operation(
      operationId = "getFeatured",
      summary = "The album to feature on Explore",
      description = "The most recently added album that has a cover. 204 when there is none yet.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The album"),
    @ApiResponse(responseCode = "204", description = "No album has a cover yet")
  })
  @GetMapping("/albums/featured")
  ResponseEntity<Album> featured() {
    return jdbc.sql(
            BrowseController.ALBUM_SELECT
                + " where al.cover_key is not null"
                + BrowseController.ALBUM_GROUP
                + " order by max(t.created_at) desc nulls last, al.id limit 1")
        .query((rs, i) -> BrowseController.album(rs))
        .optional()
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }
}
