package dev.ossm.api.video;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SubtitlesTest {

  @Test
  void turnsSrtIntoWebVtt() {
    var srt =
        "﻿1\r\n00:00:01,500 --> 00:00:03,250\r\nHello\r\nthere\r\n\r\n2\r\n01:02:03,004 --> 01:02:04,000\r\nAgain\r\n";
    assertThat(Subtitles.toVtt(srt))
        .isEqualTo(
            "WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.250\nHello\nthere\n\n2\n01:02:03.004 --> 01:02:04.000\nAgain\n");
  }

  @Test
  void leavesWebVttAlone() {
    assertThat(Subtitles.toVtt("WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n"))
        .isEqualTo("WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n");
  }

  @Test
  void normalizesLanguageTags() {
    assertThat(Subtitles.normalizeLanguage("eng")).isEqualTo("en");
    assertThat(Subtitles.normalizeLanguage("EN")).isEqualTo("en");
    assertThat(Subtitles.normalizeLanguage("ben")).isEqualTo("bn");
    assertThat(Subtitles.normalizeLanguage("und")).isNull();
    assertThat(Subtitles.normalizeLanguage("xyz")).isNull();
  }

  @Test
  void labelsTracksForTheMenu() {
    assertThat(Subtitles.label("en", null, 0)).isEqualTo("English");
    assertThat(Subtitles.label("es", "Forced", 1)).isEqualTo("Spanish (Forced)");
    assertThat(Subtitles.label(null, "Commentary", 2)).isEqualTo("Commentary");
    assertThat(Subtitles.label(null, null, 2)).isEqualTo("Subtitles 3");
  }

  @Test
  void readsTheLanguageFromASidecarName() {
    assertThat(Subtitles.languageFromFilename("Sintel.2010.en.srt")).contains("en");
    assertThat(Subtitles.languageFromFilename("Sintel.eng.forced.srt")).contains("en");
    assertThat(Subtitles.languageFromFilename("Sintel.srt")).isEmpty();
  }
}
