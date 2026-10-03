const LOSSLESS = new Set(["flac", "wav", "alac"]);

export type Quality = { label: string; lossless: boolean };

/** "FLAC", "MP3 320", "OPUS 160": the codec, with the bitrate for lossy formats. Null when the codec is unknown. */
export function quality(codec: string | undefined, bitrateKbps: number | undefined): Quality | null {
  if (!codec) return null;
  const name = codec.toUpperCase();
  const lossless = LOSSLESS.has(codec.toLowerCase());
  return { label: lossless || !bitrateKbps ? name : `${name} ${Math.round(bitrateKbps)}`, lossless };
}
