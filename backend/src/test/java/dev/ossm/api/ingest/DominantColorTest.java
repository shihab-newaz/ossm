package dev.ossm.api.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class DominantColorTest {

  private static byte[] png(BufferedImage image) throws IOException {
    var out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    return out.toByteArray();
  }

  private static BufferedImage fill(int size, Color color) {
    var image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
    var g = image.createGraphics();
    g.setColor(color);
    g.fillRect(0, 0, size, size);
    g.dispose();
    return image;
  }

  @Test
  void aSolidCoverIsExactlyThatColor() throws IOException {
    assertThat(DominantColor.of(png(fill(40, new Color(0xE8, 0x64, 0x2C))))).contains("#e8642c");
  }

  @Test
  void vividColorBeatsAMoreCommonGrey() throws IOException {
    var image = fill(100, new Color(128, 128, 128));
    var g = image.createGraphics();
    g.setColor(new Color(220, 40, 40));
    g.fillRect(0, 0, 100, 40);
    g.dispose();

    assertThat(DominantColor.of(png(image))).contains("#dc2828");
  }

  @Test
  void aWhiteCoverWithASmallLogoStillPicksTheLogoColor() throws IOException {
    var image = fill(100, Color.WHITE);
    var g = image.createGraphics();
    g.setColor(new Color(30, 90, 200));
    g.fillRect(30, 30, 40, 40);
    g.dispose();

    assertThat(DominantColor.of(png(image))).contains("#1e5ac8");
  }

  @Test
  void aPlainGreyCoverIsGrey() throws IOException {
    assertThat(DominantColor.of(png(fill(30, new Color(100, 100, 100))))).contains("#646464");
  }

  @Test
  void transparentPixelsAreIgnored() throws IOException {
    var image = new BufferedImage(40, 40, BufferedImage.TYPE_INT_ARGB);
    var g = image.createGraphics();
    g.setColor(new Color(10, 160, 60));
    g.fillRect(0, 0, 10, 10);
    g.dispose();

    assertThat(DominantColor.of(png(image))).contains("#0aa03c");
  }

  @Test
  void aFullyTransparentOrUndecodableImageHasNoColor() throws IOException {
    assertThat(DominantColor.of(png(new BufferedImage(8, 8, BufferedImage.TYPE_INT_ARGB))))
        .isEmpty();
    assertThat(DominantColor.of("not an image".getBytes())).isEmpty();
    assertThat(DominantColor.of(new byte[0])).isEmpty();
  }
}
