package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PartSizingTest {

  private static final long MIB = 1024L * 1024;
  private static final long GIB = 1024 * MIB;

  @Test
  void smallFilesUseSixteenMibParts() {
    assertThat(PartSizing.forSize(1)).isEqualTo(16 * MIB);
    assertThat(PartSizing.forSize(250 * MIB)).isEqualTo(16 * MIB);
  }

  @Test
  void aTwentyGibVideoStillUsesSixteenMibPartsAndStaysUnderTheS3Limit() {
    assertThat(PartSizing.forSize(20 * GIB)).isEqualTo(16 * MIB);
    assertThat(PartSizing.partCount(20 * GIB)).isEqualTo(1280);
  }

  @Test
  void exactlyTenThousandSixteenMibPartsIsTheLastSizeBeforePartsGrow() {
    assertThat(PartSizing.forSize(16 * MIB * 10_000)).isEqualTo(16 * MIB);
    assertThat(PartSizing.partCount(16 * MIB * 10_000)).isEqualTo(10_000);
  }

  @Test
  void oneByteMoreGrowsThePartToTheNextWholeMib() {
    assertThat(PartSizing.forSize(16 * MIB * 10_000 + 1)).isEqualTo(17 * MIB);
    assertThat(PartSizing.partCount(16 * MIB * 10_000 + 1)).isEqualTo(9_412);
  }
}
