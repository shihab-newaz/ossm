package dev.ossm.api.ingest;

import java.time.Duration;

/**
 * How a failing ingest job is retried: exponential backoff from 30 seconds, then give up and tell
 * the user. Pure, so the schedule can be tested without a clock or a database.
 */
final class RetryPolicy {

  static final int MAX_ATTEMPTS = 5;
  private static final Duration FIRST_DELAY = Duration.ofSeconds(30);
  private static final Duration MAX_DELAY = Duration.ofMinutes(30);

  private RetryPolicy() {}

  /** Whether another attempt is allowed after this many consecutive failures. */
  static boolean shouldRetry(int consecutiveFailures) {
    return consecutiveFailures < MAX_ATTEMPTS;
  }

  /** Wait before the next attempt: 30 s, 1 min, 2 min, 4 min, ... capped at 30 minutes. */
  static Duration delayAfter(int consecutiveFailures) {
    var exponent = Math.max(0, Math.min(consecutiveFailures - 1, 20));
    var delay = FIRST_DELAY.multipliedBy(1L << exponent);
    return delay.compareTo(MAX_DELAY) > 0 ? MAX_DELAY : delay;
  }
}
