package dev.ossm.api.video;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ContentDispositionsTest {

  @Test
  void anAsciiNameIsSpelledTwiceTheSame() {
    assertThat(ContentDispositions.attachment("Beach Day.mp4"))
        .isEqualTo("attachment; filename=\"Beach Day.mp4\"; filename*=UTF-8''Beach%20Day.mp4");
  }

  @Test
  void aNonAsciiNameKeepsItsExactSpellingInTheEncodedForm() {
    var header = ContentDispositions.attachment("Café ☕ 日本.mp4");

    // Old clients get underscores; everything current reads the percent-encoded UTF-8.
    assertThat(header).contains("filename=\"Caf_ _ __.mp4\"");
    assertThat(header).contains("filename*=UTF-8''Caf%C3%A9%20%E2%98%95%20%E6%97%A5%E6%9C%AC.mp4");
  }

  @Test
  void quotesBackslashesAndPercentSignsCannotBreakOutOfTheQuotedName() {
    var header = ContentDispositions.attachment("a\"b\\c%d.mp4");

    assertThat(header).contains("filename=\"a_b_c_d.mp4\"");
    assertThat(header).contains("filename*=UTF-8''a%22b%5Cc%25d.mp4");
  }

  @Test
  void aLineBreakInTheNameCannotStartAnotherHeader() {
    var header = ContentDispositions.attachment("clip\r\nSet-Cookie: x=1\u007f.mp4");

    assertThat(header).doesNotContain("\r").doesNotContain("\n");
    assertThat(header).contains("filename=\"clipSet-Cookie: x=1.mp4\"");
  }

  @Test
  void aNameWithNothingLeftFallsBackToVideo() {
    assertThat(ContentDispositions.attachment("\r\n")).contains("filename=\"video\"");
    assertThat(ContentDispositions.attachment("   ")).contains("filename=\"video\"");
  }
}
