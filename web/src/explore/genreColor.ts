/** How many tile colours DESIGN.md defines (--tile-1 to --tile-12). */
export const TILE_COLORS = 12;

/** FNV-1a: tiny, stable across runs and machines, and spreads similar strings well. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Which of the 12 tile colours a genre has, from its slug: the same genre is always the same colour, everywhere. */
export function tileIndex(slug: string): number {
  return (hash(slug) % TILE_COLORS) + 1;
}

export function tileColor(slug: string): string {
  return `var(--tile-${tileIndex(slug)})`;
}
