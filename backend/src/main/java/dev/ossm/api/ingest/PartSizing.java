package dev.ossm.api.ingest;

/**
 * How a file is cut into multipart-upload parts. Parts are 16 MiB until a file would need more than
 * S3's 10,000 parts; past that they grow in whole MiB, just enough to fit.
 */
final class PartSizing {

  private static final long MIB = 1024L * 1024;

  /** S3 needs at least 5 MiB per part except the last; 16 MiB keeps the part count low. */
  static final long MIN_PART_SIZE = 16 * MIB;

  /** S3's limit on parts in one multipart upload. */
  static final int MAX_PARTS = 10_000;

  private PartSizing() {}

  static long forSize(long sizeBytes) {
    long needed = Math.ceilDiv(sizeBytes, MAX_PARTS);
    return Math.max(MIN_PART_SIZE, Math.ceilDiv(needed, MIB) * MIB);
  }

  static int partCount(long sizeBytes) {
    return (int) Math.ceilDiv(sizeBytes, forSize(sizeBytes));
  }
}
