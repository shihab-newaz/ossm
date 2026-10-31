package dev.ossm.api.library;

import dev.ossm.api.library.BrowseController.Album;
import dev.ossm.api.library.BrowseController.Artist;
import dev.ossm.api.library.LibraryController.Track;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Search over the shared library. Every route needs a login; the library is shared. */
@RestController
@RequestMapping("/api/v1")
class SearchController {

  record SearchTop(
      @Schema(
              requiredMode = Schema.RequiredMode.REQUIRED,
              allowableValues = {"track", "album", "artist"})
          String type,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id) {}

  record SearchResults(
      @Schema(description = "The best match overall. Look it up by id in the group its type names.")
          SearchTop top,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Track> tracks,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Album> albums,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Artist> artists) {}

  /** A hit and how well it matched, 0 to 1. */
  private record Scored<T>(T item, double score) {}

  private static final int DEFAULT_LIMIT = 8;
  private static final int MAX_LIMIT = 50;
  private static final int MAX_QUERY_LENGTH = 200;

  private static final Pattern NOT_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

  /**
   * Typos cost far more trigram similarity than Postgres' default of 0.5 allows ("glroy" for
   * "glory" scores about 0.4, "rodas" for "roads" 0.2). Loosened for the search transaction only;
   * ranking keeps the best matches on top. Strict means a match must line up with whole words, so
   * "radiohead" does not find "Portishead" through the shared "head".
   */
  private static final double TRIGRAM_THRESHOLD = 0.2;

  /**
   * What the words typed so far are worth when they are the start of words in the text: below an
   * exact word (1.0), above most typo matches.
   */
  private static final String PREFIX_SCORE = "0.8";

  /**
   * What a match through the artist or album text is worth next to one on the title or name itself,
   * so "dummy" lists a track called "Dummy" before the other tracks of the album Dummy.
   */
  private static final String SECONDARY_WEIGHT = "0.9";

  private final JdbcClient jdbc;

  SearchController(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Operation(
      operationId = "search",
      summary = "Find tracks, albums and artists in the shared library",
      description =
          "Matches whole and partial words, and tolerates typos. Each group is best match first.")
  @GetMapping("/search")
  @Transactional(readOnly = true)
  SearchResults search(
      @RequestParam String q, @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {
    if (limit < 1 || limit > MAX_LIMIT) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT + ".");
    }
    if (q.length() > MAX_QUERY_LENGTH) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "q can be at most " + MAX_QUERY_LENGTH + " characters.");
    }
    var prefixQuery = prefixQuery(q);
    if (prefixQuery.isEmpty()) {
      return new SearchResults(null, List.of(), List.of(), List.of());
    }

    jdbc.sql("select set_config('pg_trgm.strict_word_similarity_threshold', :threshold, true)")
        .param("threshold", String.valueOf(TRIGRAM_THRESHOLD))
        .query(String.class)
        .single();

    var tracks =
        jdbc.sql(
                "select "
                    + score("t.title", "t.search_text")
                    + " as score, "
                    + LibraryController.TRACK_COLUMNS
                    + LibraryController.TRACK_JOINS
                    + " where "
                    + matches("t.search_text")
                    + " order by score desc, lower(t.title), t.id limit :limit")
            .param("q", q)
            .param("prefix", prefixQuery)
            .param("limit", limit)
            .query((rs, i) -> new Scored<>(LibraryController.track(rs), rs.getDouble("score")))
            .list();

    var albums =
        jdbc.sql(
                BrowseController.ALBUM_SELECT.replaceFirst(
                        "^select ", "select " + score("al.title", "al.search_text") + " as score, ")
                    + " where "
                    + matches("al.search_text")
                    + BrowseController.ALBUM_GROUP
                    + " order by score desc, lower(al.title), al.id limit :limit")
            .param("q", q)
            .param("prefix", prefixQuery)
            .param("limit", limit)
            .query((rs, i) -> new Scored<>(BrowseController.album(rs), rs.getDouble("score")))
            .list();

    var artists =
        jdbc.sql(
                BrowseController.ARTIST_SELECT.replaceFirst(
                        "^select ", "select " + score("a.name", "a.name") + " as score, ")
                    + " where "
                    + matches("a.name")
                    + " order by score desc, lower(a.name), a.id limit :limit")
            .param("q", q)
            .param("prefix", prefixQuery)
            .param("limit", limit)
            .query((rs, i) -> new Scored<>(BrowseController.artist(rs), rs.getDouble("score")))
            .list();

    return new SearchResults(
        top(tracks, albums, artists),
        tracks.stream().map(Scored::item).toList(),
        albums.stream().map(Scored::item).toList(),
        artists.stream().map(Scored::item).toList());
  }

  /**
   * The words of the query as a prefix tsquery ("glory bo" becomes {@code glory:* & bo:*}), or
   * empty when there are no words. Only letters and digits survive, so it is always valid tsquery
   * syntax.
   */
  private static String prefixQuery(String q) {
    var words = NOT_WORD.split(q.toLowerCase(Locale.ROOT));
    var terms = new ArrayList<String>();
    for (var word : words) {
      if (!word.isEmpty()) {
        terms.add(word + ":*");
      }
    }
    return String.join(" & ", terms);
  }

  /** Rows worth scoring: a trigram match (typos) or the typed words starting words in the text. */
  private static String matches(String text) {
    return "(:q <<% "
        + text
        + " or to_tsvector('simple', "
        + text
        + ") @@ to_tsquery('simple', :prefix))";
  }

  /** The better of a match on the title or name itself and a discounted one on the wider text. */
  private static String score(String title, String text) {
    var prefix = "to_tsquery('simple', :prefix)";
    return "greatest(strict_word_similarity(:q, "
        + title
        + "), strict_word_similarity(:q, "
        + text
        + ") * "
        + SECONDARY_WEIGHT
        + ", case when to_tsvector('simple', "
        + title
        + ") @@ "
        + prefix
        + " then "
        + PREFIX_SCORE
        + " else 0 end, case when to_tsvector('simple', "
        + text
        + ") @@ "
        + prefix
        + " then "
        + PREFIX_SCORE
        + " * "
        + SECONDARY_WEIGHT
        + " else 0 end)";
  }

  /** The highest score of any group's best hit. On a tie an artist beats an album beats a track. */
  private static SearchTop top(
      List<Scored<Track>> tracks, List<Scored<Album>> albums, List<Scored<Artist>> artists) {
    var candidates = new ArrayList<Scored<SearchTop>>();
    // Added in tie-break order: the first of equal scores wins.
    if (!artists.isEmpty()) {
      var best = artists.getFirst();
      candidates.add(new Scored<>(new SearchTop("artist", best.item().id()), best.score()));
    }
    if (!albums.isEmpty()) {
      var best = albums.getFirst();
      candidates.add(new Scored<>(new SearchTop("album", best.item().id()), best.score()));
    }
    if (!tracks.isEmpty()) {
      var best = tracks.getFirst();
      candidates.add(new Scored<>(new SearchTop("track", best.item().id()), best.score()));
    }
    Scored<SearchTop> winner = null;
    for (var candidate : candidates) {
      if (winner == null || candidate.score() > winner.score()) {
        winner = candidate;
      }
    }
    return winner == null ? null : winner.item();
  }
}
