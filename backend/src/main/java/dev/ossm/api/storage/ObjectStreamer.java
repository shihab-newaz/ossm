package dev.ossm.api.storage;

import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/**
 * Sends a stored object to the browser through the API with a single byte range (ADR 0006), for
 * tracks and videos alike. The object is opened before the response begins, so a missing file is a
 * clean 404 and not a torn stream.
 */
@Component
public class ObjectStreamer {

  private final S3Client s3;
  private final Bucket bucket;

  ObjectStreamer(S3Client s3, Bucket bucket) {
    this.s3 = s3;
    this.bucket = bucket;
  }

  public ResponseEntity<StreamingResponseBody> stream(
      String key, long size, String rangeHeader, MediaType type, String missingMessage) {
    var wanted = singleRange(rangeHeader);
    long start = 0;
    long end = size - 1;
    if (wanted != null) {
      start = wanted.getRangeStart(size);
      if (start >= size) {
        return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            .header(HttpHeaders.CONTENT_RANGE, "bytes */" + size)
            .build();
      }
      end = wanted.getRangeEnd(size);
    }

    var object = open(key, wanted == null ? null : "bytes=" + start + "-" + end, missingMessage);
    StreamingResponseBody body =
        out -> {
          try (var in = object) {
            in.transferTo(out);
          }
        };

    var response =
        ResponseEntity.status(wanted == null ? HttpStatus.OK : HttpStatus.PARTIAL_CONTENT)
            .contentType(type)
            .contentLength(end - start + 1)
            .header(HttpHeaders.ACCEPT_RANGES, "bytes")
            // The bytes behind an id never change; private because every route needs a login.
            .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate());
    if (wanted != null) {
      response.header(HttpHeaders.CONTENT_RANGE, "bytes %d-%d/%d".formatted(start, end, size));
    }
    return response.body(body);
  }

  /**
   * The one range a player asks for. Anything else (several ranges, another unit, garbage) is
   * ignored, which HTTP allows: the client gets the whole file.
   */
  private static HttpRange singleRange(String header) {
    if (header == null || header.isBlank()) {
      return null;
    }
    try {
      var ranges = HttpRange.parseRanges(header);
      return ranges.size() == 1 ? ranges.get(0) : null;
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  private ResponseInputStream<GetObjectResponse> open(
      String key, String range, String missingMessage) {
    try {
      return s3.getObject(
          b -> {
            b.bucket(bucket.ensure()).key(key);
            if (range != null) {
              b.range(range);
            }
          });
    } catch (NoSuchKeyException e) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, missingMessage);
    }
  }
}
