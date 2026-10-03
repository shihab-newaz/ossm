package dev.ossm.api;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/** A browser stand-in: a JDK HttpClient with its own cookie jar, talking JSON to one server. */
final class Session {

  private final int port;
  private final CookieManager cookies = new CookieManager();
  private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

  Session(int port) {
    this.port = port;
  }

  HttpResponse<String> get(String path) throws Exception {
    return send(HttpRequest.newBuilder(uri(path)).GET().build());
  }

  HttpResponse<byte[]> getBytes(String path) throws Exception {
    return client.send(
        HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
  }

  HttpResponse<byte[]> getBytes(String path, String range) throws Exception {
    return client.send(
        HttpRequest.newBuilder(uri(path)).header("Range", range).GET().build(),
        HttpResponse.BodyHandlers.ofByteArray());
  }

  HttpResponse<String> post(String path, String json) throws Exception {
    return send(
        HttpRequest.newBuilder(uri(path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build());
  }

  /** The raw session cookie value, to replay from a different client or after a restart. */
  String sessionCookie() {
    return cookies.getCookieStore().getCookies().stream()
        .filter(c -> c.getName().equals("OSSM_SESSION"))
        .map(c -> c.getValue())
        .findFirst()
        .orElse(null);
  }

  /** A request carrying a session cookie by hand, bypassing any jar. */
  static HttpResponse<String> getWithCookie(int port, String path, String cookie) throws Exception {
    return HttpClient.newHttpClient()
        .send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Cookie", "OSSM_SESSION=" + cookie)
                .build(),
            HttpResponse.BodyHandlers.ofString());
  }

  private URI uri(String path) {
    return URI.create("http://localhost:" + port + path);
  }

  private HttpResponse<String> send(HttpRequest request) throws Exception {
    return client.send(request, HttpResponse.BodyHandlers.ofString());
  }
}
