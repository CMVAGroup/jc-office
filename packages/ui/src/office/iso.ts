// Isometrische projectie: gridcel → schermcoördinaat.
export const TILE_W = 56;
export const TILE_H = 28;

export function iso(x: number, y: number, z = 0) {
  return { sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) - z * TILE_H };
}

/** Polygoonpunten van een vloerrechthoek (in cellen) op hoogte z. */
export function isoRect(x: number, y: number, w: number, h: number, z = 0): string {
  const p = [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + h, z), iso(x, y + h, z)];
  return p.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' ');
}

/** Drie zichtbare vlakken van een iso-blok: boven, links-voor, rechts-voor. */
export function isoBox(x: number, y: number, w: number, h: number, height: number) {
  const top = isoRect(x, y, w, h, height);
  const a = iso(x, y + h, 0);
  const b = iso(x + w, y + h, 0);
  const c = iso(x + w, y, 0);
  const a2 = iso(x, y + h, height);
  const b2 = iso(x + w, y + h, height);
  const c2 = iso(x + w, y, height);
  const pts = (arr: { sx: number; sy: number }[]) => arr.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' ');
  return { top, left: pts([a, b, b2, a2]), right: pts([b, c, c2, b2]) };
}
