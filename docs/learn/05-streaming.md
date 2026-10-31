# 5. Streaming with range requests

Ticket 07. ADR 0006.

## Goal

An authenticated endpoint that plays any track, supports seeking, and keeps the object store private. Cover art is served the same way.

## Learn first

- HTTP range requests: the `Range` request header, `206 Partial Content`, `Content-Range`, `Accept-Ranges`, and `416 Range Not Satisfiable`.
- What a browser's `<audio>` element sends when you seek (a single range).
- Streaming a response body in Spring MVC (`StreamingResponseBody`) and why that is cheap on virtual threads.
- `Cache-Control: private` versus `public`.

## Range forms and their answers

| Request | Meaning | Answer for a 1000-byte file |
|---|---|---|
| `bytes=0-99` | first 100 bytes | 206, `Content-Range: bytes 0-99/1000` |
| `bytes=900-` | from 900 to the end | 206, `bytes 900-999/1000` |
| `bytes=-100` | last 100 bytes | 206, `bytes 900-999/1000` |
| `bytes=0-5000` | end past the file | 206, clamped: `bytes 0-999/1000` |
| `bytes=1000-` | start past the end | 416, `Content-Range: bytes */1000` |
| garbage, another unit, or several ranges | not understood | 200, the whole file (HTTP allows ignoring `Range`) |

## Procedure

1. Look up the track's object key and size in Postgres. No row means 404.
2. Parse the `Range` header, accepting exactly one range. Anything else is treated as no range.
3. Compute `start` and `end` from the stored size. If `start` is past the end, answer 416 with `Content-Range: bytes */size`.
4. Ask the store for just that range (`bytes=start-end`), so seeking in a 250 MB file does not read the start.
5. Open the object *before* the response begins. A track whose file has gone missing is then a clean 404 problem response, not a torn stream.
6. Copy the object to the response with `StreamingResponseBody`. The copy blocks on I/O, which is cheap on a virtual thread.
7. Set `Content-Type` from the key's extension, `Content-Length`, `Accept-Ranges: bytes`, and `Cache-Control: private, max-age=86400`. Add `Content-Range` when the answer is 206.
8. Serve cover art with the same rules.

## Decisions and why (ADR 0006)

- **Proxy through the API instead of presigned read URLs.** Playback is a read on every listen and must be behind the login. The store has no users of its own, and a presigned link would keep working after a user is deactivated or logs out.
- **Direct play only.** The file is sent as stored. No transcoding.
- **One range.** Browsers only ever ask for one. Ignoring the others is allowed by HTTP.
- **Cache privately for a day.** The bytes behind a track id never change, and `private` keeps shared caches from holding audio that needs a login.

## Not covered (recorded in the ADR)

- Conditional requests (`If-Range`, `ETag`).
- `HEAD` works because Spring derives it from the `GET` mapping and returns the right length, but it has not been checked whether it opens the object in the store.

## Snippets

**The endpoint** (`library/StreamController.java`, OpenAPI annotations left out).

```java
@GetMapping("/tracks/{id}/stream")
ResponseEntity<StreamingResponseBody> stream(
    @PathVariable UUID id,
    @RequestHeader(value = HttpHeaders.RANGE, required = false) String range) {
  var stored =
      jdbc.sql("select object_key, size_bytes from track where id = :id")
          .param("id", id)
          .query((rs, i) -> new Stored(rs.getString("object_key"), rs.getLong("size_bytes")))
          .optional()
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such track."));

  var wanted = singleRange(range);
  long start = 0;
  long end = stored.size() - 1;
  if (wanted != null) {
    start = wanted.getRangeStart(stored.size());
    if (start >= stored.size()) {
      return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
          .header(HttpHeaders.CONTENT_RANGE, "bytes */" + stored.size())
          .build();
    }
    end = wanted.getRangeEnd(stored.size());
  }

  // Opened before the response starts, so a missing object is a clean 404 and not a torn stream.
  var object = open(stored.key(), wanted == null ? null : "bytes=" + start + "-" + end);
  StreamingResponseBody body =
      out -> {
        try (var in = object) {
          in.transferTo(out);
        }
      };

  var response =
      ResponseEntity.status(wanted == null ? HttpStatus.OK : HttpStatus.PARTIAL_CONTENT)
          .contentType(contentType(stored.key()))
          .contentLength(end - start + 1)
          .header(HttpHeaders.ACCEPT_RANGES, "bytes")
          // The file behind a track id never changes; private because the route needs a login.
          .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate());
  if (wanted != null) {
    response.header(
        HttpHeaders.CONTENT_RANGE, "bytes %d-%d/%d".formatted(start, end, stored.size()));
  }
  return response.body(body);
}
```

**Accepting exactly one range** (same file). Spring's `HttpRange` does the arithmetic for `a-b`, `a-` and `-n`; anything else is ignored, which HTTP allows.

```java
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
```

**Passing the range to the store, and mapping a missing object** (same file).

```java
private ResponseInputStream<GetObjectResponse> open(String key, String range) {
  try {
    return s3.getObject(
        b -> {
          b.bucket(bucket.ensure()).key(key);
          if (range != null) {
            b.range(range);
          }
        });
  } catch (NoSuchKeyException e) {
    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The audio file is missing.");
  }
}
```

**A test per range form** (`StreamTest`). Upload a real file through the API, then compare bytes. The helper keeps the tests one assertion block each.

```java
@Test
void aSuffixRangeReturnsTheLastBytes() throws Exception {
  var u = uploaded();                         // setup, upload via presigned flow, await DONE

  var response = get(u, "bytes=-128");

  assertThat(response.statusCode()).isEqualTo(206);
  assertThat(response.body())
      .isEqualTo(Arrays.copyOfRange(u.bytes(), u.bytes().length - 128, u.bytes().length));
  assertThat(response.headers().firstValue("Content-Range"))
      .contains("bytes %d-%d/%d"
          .formatted(u.bytes().length - 128, u.bytes().length - 1, u.bytes().length));
}
```

## Checkpoint

Write one test per row of the table above, with a small file whose bytes you can compare. Then:

- [ ] A track streams in full with `Content-Type`, `Content-Length` and `Accept-Ranges`.
- [ ] A range from the middle returns only those bytes and the right `Content-Range`.
- [ ] A suffix longer than the file returns the whole file as 206.
- [ ] An unknown track is 404.
- [ ] A track whose object was deleted from the store is 404, not 500.
- [ ] An anonymous request is 401.
- [ ] Directly requesting the store without a signature is refused (403), and the store has no published port in compose.

## Reference code

`backend/src/main/java/dev/ossm/api/library/StreamController.java`. Test: `StreamTest` (thirteen cases, covering each behaviour above).
