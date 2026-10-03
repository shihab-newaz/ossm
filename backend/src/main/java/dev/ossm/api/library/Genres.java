package dev.ossm.api.library;

/** How genre tags become the stable slugs used in URLs and for tile colours. */
final class Genres {

  private Genres() {}

  /**
   * SQL for the slug of a genre column: lower case, every run of non-letters-or-digits becomes one
   * hyphen, none at the ends. "Hip-Hop", "hip hop " and "HIP/HOP" are all {@code hip-hop}. Doing it
   * in SQL keeps one definition for grouping and for filtering.
   */
  static String slug(String column) {
    return "trim(both '-' from regexp_replace(lower(trim("
        + column
        + ")), '[^[:alnum:]]+', '-', 'g'))";
  }
}
