package dev.ossm.api.ingest;

import java.util.List;

/** The licences a track can be labelled with. Mirrors the enum in contract/openapi.yaml. */
final class Licenses {

  static final String DEFAULT = "All rights reserved";

  static final List<String> ALLOWED =
      List.of(
          DEFAULT,
          "CC BY",
          "CC BY-SA",
          "CC BY-NC",
          "CC BY-ND",
          "CC BY-NC-SA",
          "CC BY-NC-ND",
          "CC0");

  private Licenses() {}

  /** Null or blank means the default; anything else must be one of the known licences. */
  static String resolve(String requested) {
    if (requested == null || requested.isBlank()) {
      return DEFAULT;
    }
    if (!ALLOWED.contains(requested)) {
      throw new IllegalArgumentException("Choose one of the listed licenses.");
    }
    return requested;
  }
}
