package dev.ossm.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * What the browser does with an upload: ask the API for presigned part URLs, PUT the bytes straight
 * to the store, then tell the API it is done.
 */
final class StoreClient {

  private static final HttpClient STORE = HttpClient.newHttpClient();

  record Started(String uploadId, long partSize, List<String> partUrls, String ticketJson) {}

  private StoreClient() {}

  static Started start(Session session, String filename, long size) throws Exception {
    return start(session, filename, size, null);
  }

  static Started start(Session session, String filename, long size, String license)
      throws Exception {
    return start(session, filename, size, license, null);
  }

  /** A null kind leaves it out of the request, as music uploads did before kinds existed. */
  static Started start(Session session, String filename, long size, String license, String kind)
      throws Exception {
    var licenseJson = license == null ? "" : ",\"license\":\"%s\"".formatted(license);
    var kindJson = kind == null ? "" : ",\"kind\":\"%s\"".formatted(kind);
    var response =
        session.post(
            "/api/v1/uploads",
            "{\"filename\":\"%s\",\"sizeBytes\":%d%s%s}"
                .formatted(filename, size, licenseJson, kindJson));
    assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
    var urls = new ArrayList<String>();
    var matcher = Pattern.compile("\"url\":\"([^\"]+)\"").matcher(response.body());
    while (matcher.find()) {
      urls.add(matcher.group(1).replace("\\u0026", "&"));
    }
    var partSize = Long.parseLong(first(response.body(), "\"partSizeBytes\":(\\d+)"));
    return new Started(
        first(response.body(), "\"upload\":\\{\"id\":\"([^\"]+)\""),
        partSize,
        urls,
        response.body());
  }

  /** Sends each part to its presigned URL and returns the completion body for the API. */
  static String putParts(Started started, byte[] file) throws Exception {
    var parts = new ArrayList<String>();
    for (int i = 0; i < started.partUrls().size(); i++) {
      int from = (int) (i * started.partSize());
      int to = (int) Math.min(file.length, from + started.partSize());
      var put =
          STORE.send(
              HttpRequest.newBuilder(URI.create(started.partUrls().get(i)))
                  .PUT(
                      HttpRequest.BodyPublishers.ofByteArray(
                          java.util.Arrays.copyOfRange(file, from, to)))
                  .build(),
              HttpResponse.BodyHandlers.discarding());
      assertThat(put.statusCode()).as("part " + (i + 1)).isEqualTo(200);
      var etag = put.headers().firstValue("ETag").orElseThrow();
      parts.add("{\"partNumber\":%d,\"etag\":%s}".formatted(i + 1, quote(etag)));
    }
    return "{\"parts\":[" + String.join(",", parts) + "]}";
  }

  /**
   * Streams {@code bytes} zero bytes as part 1, whatever size was declared, and returns the
   * completion body. Presigned URLs can't enforce a size, so this is what a lying client can do.
   */
  static String putSinglePartOf(Started started, long bytes) throws Exception {
    var put =
        STORE.send(
            HttpRequest.newBuilder(URI.create(started.partUrls().get(0)))
                .PUT(
                    HttpRequest.BodyPublishers.fromPublisher(
                        HttpRequest.BodyPublishers.ofInputStream(() -> zeros(bytes)), bytes))
                .build(),
            HttpResponse.BodyHandlers.discarding());
    assertThat(put.statusCode()).as("oversized part").isEqualTo(200);
    var etag = put.headers().firstValue("ETag").orElseThrow();
    return "{\"parts\":[{\"partNumber\":1,\"etag\":%s}]}".formatted(quote(etag));
  }

  private static java.io.InputStream zeros(long length) {
    return new java.io.InputStream() {
      private long left = length;

      @Override
      public int read() {
        if (left <= 0) {
          return -1;
        }
        left--;
        return 0;
      }

      @Override
      public int read(byte[] buffer, int offset, int len) {
        if (left <= 0) {
          return -1;
        }
        int n = (int) Math.min(len, left);
        java.util.Arrays.fill(buffer, offset, offset + n, (byte) 0);
        left -= n;
        return n;
      }
    };
  }

  /** A whole upload: start, send, complete. Returns the upload id. */
  static String upload(Session session, String filename, byte[] file) throws Exception {
    return upload(session, filename, file, null);
  }

  static String upload(Session session, String filename, byte[] file, String license)
      throws Exception {
    return upload(session, filename, file, license, null);
  }

  /** A whole video upload, which is the same handshake with the VIDEO kind. */
  static String uploadVideo(Session session, String filename, byte[] file) throws Exception {
    return upload(session, filename, file, null, "VIDEO");
  }

  private static String upload(
      Session session, String filename, byte[] file, String license, String kind) throws Exception {
    var started = start(session, filename, file.length, license, kind);
    var complete =
        session.post(
            "/api/v1/uploads/" + started.uploadId() + "/complete", putParts(started, file));
    assertThat(complete.statusCode()).as(complete.body()).isEqualTo(202);
    return started.uploadId();
  }

  /** Polls until ingest reaches DONE or FAILED, and returns that upload's JSON. */
  static String awaitFinished(Session session, String uploadId) throws Exception {
    var deadline = System.nanoTime() + java.time.Duration.ofSeconds(45).toNanos();
    String body;
    do {
      body = session.get("/api/v1/uploads/" + uploadId).body();
      if (body.matches("(?s).*\"status\":\"(DONE|FAILED|DUPLICATE)\".*")) {
        return body;
      }
      Thread.sleep(250);
    } while (System.nanoTime() < deadline);
    throw new AssertionError("Ingest did not finish in time: " + body);
  }

  static String first(String text, String regex) {
    var m = Pattern.compile(regex).matcher(text);
    assertThat(m.find()).as(text).isTrue();
    return m.group(1);
  }

  private static String quote(String value) {
    return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }
}
