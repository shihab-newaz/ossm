package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class RetryPolicyTest {

  @Test
  void backsOffExponentiallyFromThirtySeconds() {
    assertThat(RetryPolicy.delayAfter(1)).isEqualTo(Duration.ofSeconds(30));
    assertThat(RetryPolicy.delayAfter(2)).isEqualTo(Duration.ofMinutes(1));
    assertThat(RetryPolicy.delayAfter(3)).isEqualTo(Duration.ofMinutes(2));
    assertThat(RetryPolicy.delayAfter(4)).isEqualTo(Duration.ofMinutes(4));
  }

  @Test
  void neverWaitsLongerThanThirtyMinutes() {
    assertThat(RetryPolicy.delayAfter(12)).isEqualTo(Duration.ofMinutes(30));
    assertThat(RetryPolicy.delayAfter(500)).isEqualTo(Duration.ofMinutes(30));
  }

  @Test
  void survivesNonsenseInput() {
    assertThat(RetryPolicy.delayAfter(0)).isEqualTo(Duration.ofSeconds(30));
    assertThat(RetryPolicy.delayAfter(-3)).isEqualTo(Duration.ofSeconds(30));
  }

  @Test
  void givesUpAfterFiveFailures() {
    assertThat(RetryPolicy.shouldRetry(1)).isTrue();
    assertThat(RetryPolicy.shouldRetry(4)).isTrue();
    assertThat(RetryPolicy.shouldRetry(5)).isFalse();
    assertThat(RetryPolicy.shouldRetry(9)).isFalse();
  }
}
