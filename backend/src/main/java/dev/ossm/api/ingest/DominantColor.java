package dev.ossm.api.ingest;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Optional;
import javax.imageio.ImageIO;

/**
 * The colour an album's page header takes from its cover. Pixels fall into coarse colour buckets;
 * saturated, reasonably bright buckets count far more than greys, white and near-black, so a
 * mostly-white cover with an orange logo is orange, not white. Pure: bytes in, "#rrggbb" out.
 */
final class DominantColor {

  private static final int SAMPLES_PER_SIDE = 64;

  private DominantColor() {}

  /** Empty if the bytes are not an image the JDK can decode (for example WebP). */
  static Optional<String> of(byte[] image) {
    final BufferedImage decoded;
    try {
      decoded = ImageIO.read(new ByteArrayInputStream(image));
    } catch (IOException | RuntimeException e) {
      return Optional.empty();
    }
    if (decoded == null) {
      return Optional.empty();
    }
    var weight = new double[4096];
    var sum = new long[4096][3];
    var count = new int[4096];
    var stepX = Math.max(1, decoded.getWidth() / SAMPLES_PER_SIDE);
    var stepY = Math.max(1, decoded.getHeight() / SAMPLES_PER_SIDE);
    for (int y = 0; y < decoded.getHeight(); y += stepY) {
      for (int x = 0; x < decoded.getWidth(); x += stepX) {
        var argb = decoded.getRGB(x, y);
        if (((argb >>> 24) & 0xFF) < 128) {
          continue;
        }
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;
        var max = Math.max(r, Math.max(g, b));
        var min = Math.min(r, Math.min(g, b));
        double value = max / 255.0;
        double saturation = max == 0 ? 0 : (max - min) / (double) max;
        var bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        weight[bucket] += 0.05 + saturation * (0.5 + value);
        sum[bucket][0] += r;
        sum[bucket][1] += g;
        sum[bucket][2] += b;
        count[bucket]++;
      }
    }
    var best = -1;
    for (int i = 0; i < weight.length; i++) {
      if (count[i] > 0 && (best < 0 || weight[i] > weight[best])) {
        best = i;
      }
    }
    if (best < 0) {
      return Optional.empty();
    }
    return Optional.of(
        "#%02x%02x%02x"
            .formatted(
                sum[best][0] / count[best],
                sum[best][1] / count[best],
                sum[best][2] / count[best]));
  }
}
