package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VideoNamesTest {

  @Test
  void readsSeasonAndEpisodeFromSxxEyy() {
    var parsed = VideoNames.parse("Night.Kitchen.S02E05.The.Long.Way.Home.1080p.WEB-DL.x264.mkv");
    assertThat(parsed.kind()).isEqualTo("EPISODE");
    assertThat(parsed.show()).isEqualTo("Night Kitchen");
    assertThat(parsed.season()).isEqualTo(2);
    assertThat(parsed.episode()).isEqualTo(5);
    assertThat(parsed.title()).isEqualTo("The Long Way Home");
  }

  @Test
  void readsNxNnAndNamesUntitledEpisodesByNumber() {
    var parsed = VideoNames.parse("Show_Name 1x02.mp4");
    assertThat(parsed.kind()).isEqualTo("EPISODE");
    assertThat(parsed.show()).isEqualTo("Show Name");
    assertThat(parsed.season()).isEqualTo(1);
    assertThat(parsed.episode()).isEqualTo(2);
    assertThat(parsed.title()).isEqualTo("Episode 2");
  }

  @Test
  void acceptsSeparatorsBetweenShowAndCode() {
    var parsed = VideoNames.parse("Field Notes - S01E03 - Hedgerows.mp4");
    assertThat(parsed.show()).isEqualTo("Field Notes");
    assertThat(parsed.title()).isEqualTo("Hedgerows");
  }

  @Test
  void readsAMovieTitleAndYear() {
    var parsed = VideoNames.parse("Movie Title (2019).mp4");
    assertThat(parsed.kind()).isEqualTo("MOVIE");
    assertThat(parsed.title()).isEqualTo("Movie Title");
    assertThat(parsed.year()).isEqualTo(2019);
  }

  @Test
  void cutsReleaseJunkAfterTheYear() {
    var parsed = VideoNames.parse("Sintel.2010.2160p.HEVC.mkv");
    assertThat(parsed.title()).isEqualTo("Sintel");
    assertThat(parsed.year()).isEqualTo(2010);
  }

  @Test
  void anythingElseIsAMovieNamedAfterTheFile() {
    var parsed = VideoNames.parse("beach day.mov");
    assertThat(parsed.kind()).isEqualTo("MOVIE");
    assertThat(parsed.title()).isEqualTo("beach day");
    assertThat(parsed.year()).isNull();
  }

  @Test
  void aYearAloneIsNotATitle() {
    var parsed = VideoNames.parse("2024.mp4");
    assertThat(parsed.title()).isEqualTo("2024");
    assertThat(parsed.year()).isNull();
  }
}
