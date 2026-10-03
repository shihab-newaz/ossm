package dev.ossm.api.library;

import dev.ossm.api.library.LibraryController.Track;
import dev.ossm.api.web.Problem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Albums and artists of the shared library, with their detail pages. Every route needs a login. */
@RestController
@RequestMapping("/api/v1")
class BrowseController {

  record Album(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String artist,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID artistId,
      Integer year,
      String coverUrl,
      String dominantColor,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int trackCount,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long durationMs) {}

  record AlbumDetail(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Album album,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "Who uploaded the first track")
          String uploadedBy,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "When the first track was added")
          Instant uploadedAt,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Track> tracks) {}

  record Artist(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int albumCount,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int trackCount,
      @Schema(description = "Cover of one of their albums, when any has one") String coverUrl) {}

  record ArtistDetail(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Artist artist,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Album> albums,
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              description = "All their tracks, singles included")
          List<Track> tracks) {}

  static final String ALBUM_SELECT =
      "select al.id, al.title, a.name as artist, al.artist_id, al.year, al.cover_key,"
          + " al.dominant_color, count(t.id) as track_count,"
          + " coalesce(sum(t.duration_ms), 0) as duration_ms"
          + " from album al join artist a on a.id = al.artist_id"
          + " left join track t on t.album_id = al.id";
  static final String ALBUM_GROUP = " group by al.id, a.name";

  private static final String TRACK_ORDER_IN_ALBUM =
      " order by t.disc_number nulls last, t.track_number nulls last, lower(t.title), t.id";

  private final JdbcClient jdbc;

  BrowseController(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  static Album album(ResultSet rs) throws SQLException {
    var id = rs.getObject("id", UUID.class);
    return new Album(
        id,
        rs.getString("title"),
        rs.getString("artist"),
        rs.getObject("artist_id", UUID.class),
        (Integer) rs.getObject("year"),
        rs.getString("cover_key") != null ? "/api/v1/albums/" + id + "/cover" : null,
        rs.getString("dominant_color"),
        rs.getInt("track_count"),
        rs.getLong("duration_ms"));
  }

  @Operation(
      operationId = "listAlbums",
      summary = "Albums in the shared library",
      description =
          "Everything unless limit and offset are given. Sorted by sort (added, newest first;"
              + " title; or artist) with a stable tie-break. The total is in X-Total-Count.")
  @ApiResponses(
      @ApiResponse(
          responseCode = "200",
          description = "Albums",
          headers = @Header(name = "X-Total-Count", schema = @Schema(type = "integer"))))
  @GetMapping("/albums")
  ResponseEntity<List<Album>> albums(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset,
      @RequestParam(defaultValue = "added")
          @Parameter(schema = @Schema(allowableValues = {"added", "title", "artist"}))
          String sort) {
    var order =
        switch (sort) {
          case "added" -> "al.created_at desc, lower(al.title), al.id";
          case "title" -> "lower(al.title), al.id";
          case "artist" -> "lower(a.name), al.year nulls last, lower(al.title), al.id";
          default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown sort.");
        };
    var total = jdbc.sql("select count(*) from album").query(Long.class).single();
    var items =
        jdbc.sql(ALBUM_SELECT + ALBUM_GROUP + " order by " + order + Paging.clause(limit, offset))
            .query((rs, i) -> album(rs))
            .list();
    return ResponseEntity.ok().header("X-Total-Count", String.valueOf(total)).body(items);
  }

  @Operation(operationId = "getAlbum", summary = "An album and its tracks")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The album"),
    @ApiResponse(
        responseCode = "404",
        description = "No such album",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/albums/{id}")
  AlbumDetail albumDetail(@PathVariable UUID id) {
    var album =
        jdbc.sql(ALBUM_SELECT + " where al.id = :id" + ALBUM_GROUP)
            .param("id", id)
            .query((rs, i) -> album(rs))
            .optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such album."));
    var tracks =
        jdbc.sql(
                "select "
                    + LibraryController.TRACK_COLUMNS
                    + LibraryController.TRACK_JOINS
                    + " where t.album_id = :id"
                    + TRACK_ORDER_IN_ALBUM)
            .param("id", id)
            .query((rs, i) -> LibraryController.track(rs))
            .list();
    // The album's first track by upload time says who added it and when.
    var first =
        jdbc.sql(
                "select u.username, t.created_at from track t join users u on u.id = t.uploader_id"
                    + " where t.album_id = :id order by t.created_at, t.id limit 1")
            .param("id", id)
            .query((rs, i) -> new Object[] {rs.getString(1), rs.getObject(2, OffsetDateTime.class)})
            .optional();
    var uploadedBy = first.map(r -> (String) r[0]).orElse("unknown");
    var uploadedAt = first.map(r -> ((OffsetDateTime) r[1]).toInstant()).orElse(Instant.EPOCH);
    return new AlbumDetail(album, uploadedBy, uploadedAt, tracks);
  }

  private static final String ARTIST_SELECT =
      "select a.id, a.name,"
          + " (select count(*) from album al where al.artist_id = a.id) as album_count,"
          + " (select count(*) from track t where t.artist_id = a.id) as track_count,"
          + " (select al.id from album al where al.artist_id = a.id and al.cover_key is not null"
          + " order by al.year desc nulls last, lower(al.title), al.id limit 1) as cover_album"
          + " from artist a";

  private static Artist artist(ResultSet rs) throws SQLException {
    var coverAlbum = rs.getObject("cover_album", UUID.class);
    return new Artist(
        rs.getObject("id", UUID.class),
        rs.getString("name"),
        rs.getInt("album_count"),
        rs.getInt("track_count"),
        coverAlbum == null ? null : "/api/v1/albums/" + coverAlbum + "/cover");
  }

  @Operation(
      operationId = "listArtists",
      summary = "Artists in the shared library, A to Z",
      description = "Everything unless limit and offset are given. The total is in X-Total-Count.")
  @ApiResponses(
      @ApiResponse(
          responseCode = "200",
          description = "Artists",
          headers = @Header(name = "X-Total-Count", schema = @Schema(type = "integer"))))
  @GetMapping("/artists")
  ResponseEntity<List<Artist>> artists(
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset) {
    var total = jdbc.sql("select count(*) from artist").query(Long.class).single();
    var items =
        jdbc.sql(ARTIST_SELECT + " order by lower(a.name), a.id" + Paging.clause(limit, offset))
            .query((rs, i) -> artist(rs))
            .list();
    return ResponseEntity.ok().header("X-Total-Count", String.valueOf(total)).body(items);
  }

  @Operation(operationId = "getArtist", summary = "An artist, their albums and their tracks")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "The artist"),
    @ApiResponse(
        responseCode = "404",
        description = "No such artist",
        content =
            @Content(
                mediaType = "application/problem+json",
                schema = @Schema(implementation = Problem.class)))
  })
  @GetMapping("/artists/{id}")
  ArtistDetail artistDetail(@PathVariable UUID id) {
    var artist =
        jdbc.sql(ARTIST_SELECT + " where a.id = :id")
            .param("id", id)
            .query((rs, i) -> artist(rs))
            .optional()
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such artist."));
    var albums =
        jdbc.sql(
                ALBUM_SELECT
                    + " where al.artist_id = :id"
                    + ALBUM_GROUP
                    + " order by al.year desc nulls last, lower(al.title), al.id")
            .param("id", id)
            .query((rs, i) -> album(rs))
            .list();
    var tracks =
        jdbc.sql(
                "select "
                    + LibraryController.TRACK_COLUMNS
                    + LibraryController.TRACK_JOINS
                    + " where t.artist_id = :id"
                    + " order by lower(al.title) nulls last, t.disc_number nulls last,"
                    + " t.track_number nulls last, lower(t.title), t.id")
            .param("id", id)
            .query((rs, i) -> LibraryController.track(rs))
            .list();
    return new ArtistDetail(artist, albums, tracks);
  }
}
