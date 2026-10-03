package dev.ossm.api.library;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** The limit/offset query parameters shared by the list endpoints. */
final class Paging {

  static final int MAX_LIMIT = 1000;

  private Paging() {}

  /** An SQL tail for the given paging, or nothing at all when the caller asked for everything. */
  static String clause(Integer limit, Integer offset) {
    if (limit != null && (limit < 1 || limit > MAX_LIMIT)) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT + ".");
    }
    if (offset != null && offset < 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "offset cannot be negative.");
    }
    var clause = new StringBuilder();
    if (limit != null) {
      clause.append(" limit ").append(limit);
    }
    if (offset != null && offset > 0) {
      clause.append(" offset ").append(offset);
    }
    return clause.toString();
  }
}
