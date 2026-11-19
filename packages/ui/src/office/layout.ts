// Kantoorplattegrond op een navgrid. Meubels blokkeren cellen; stoelen zijn begaanbare, gereserveerde cellen.
export type Role = 'lead' | 'analyst' | 'growth' | 'retention' | 'cro' | 'merch';
export const ROLES: Role[] = ['lead', 'analyst', 'growth', 'retention', 'cro', 'merch'];

export interface Cell {
  x: number;
  y: number;
}

export interface Furniture {
  id: string;
  kind: 'desk' | 'boss_desk' | 'table' | 'cabinet' | 'plant' | 'basket' | 'sofa';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hoogte in iso-eenheden voor tekenen */
  height: number;
  role?: Role;
  label?: string;
}

export const GRID_W = 20;
export const GRID_H = 14;

export const FURNITURE: Furniture[] = [
  { id: 'desk-lead', kind: 'boss_desk', x: 2, y: 2, w: 3, h: 2, height: 0.55, role: 'lead', label: 'Baas' },
  { id: 'desk-analyst', kind: 'desk', x: 8, y: 2, w: 2, h: 1, height: 0.45, role: 'analyst' },
  { id: 'desk-growth', kind: 'desk', x: 12, y: 2, w: 2, h: 1, height: 0.45, role: 'growth' },
  { id: 'desk-retention', kind: 'desk', x: 16, y: 2, w: 2, h: 1, height: 0.45, role: 'retention' },
  { id: 'desk-cro', kind: 'desk', x: 8, y: 11, w: 2, h: 1, height: 0.45, role: 'cro' },
  { id: 'desk-merch', kind: 'desk', x: 12, y: 11, w: 2, h: 1, height: 0.45, role: 'merch' },
  { id: 'meeting-table', kind: 'table', x: 8, y: 6, w: 4, h: 2, height: 0.4, label: 'Vergadertafel' },
  { id: 'cabinet-1', kind: 'cabinet', x: 2, y: 11, w: 2, h: 1, height: 0.9 },
  { id: 'plant-1', kind: 'plant', x: 5, y: 8, w: 1, h: 1, height: 0.8 },
  { id: 'plant-2', kind: 'plant', x: 15, y: 6, w: 1, h: 1, height: 0.8 },
  { id: 'sofa', kind: 'sofa', x: 2, y: 7, w: 1, h: 3, height: 0.35 },
  { id: 'basket', kind: 'basket', x: 17, y: 11, w: 1, h: 1, height: 0.15, label: 'Hondenmand' },
];

export const DESK_SEATS: Record<Role, Cell> = {
  lead: { x: 3, y: 4 },
  analyst: { x: 8, y: 3 },
  growth: { x: 12, y: 3 },
  retention: { x: 16, y: 3 },
  cro: { x: 8, y: 10 },
  merch: { x: 12, y: 10 },
};

/** Zes vaste plekken aan de vergadertafel; de baas zit aan het hoofd. */
export const MEETING_SEATS: Record<Role, Cell> = {
  lead: { x: 7, y: 6 },
  analyst: { x: 8, y: 5 },
  growth: { x: 10, y: 5 },
  retention: { x: 12, y: 7 },
  cro: { x: 8, y: 8 },
  merch: { x: 10, y: 8 },
};

export const DOG_BED: Cell = { x: 16, y: 11 };

/** Plek naast een bureau waar de hond snuffelt of waarschuwt. */
export const DOG_INSPECT_POINTS: Record<Role, Cell> = {
  lead: { x: 4, y: 4 },
  analyst: { x: 9, y: 3 },
  growth: { x: 13, y: 3 },
  retention: { x: 17, y: 3 },
  cro: { x: 9, y: 10 },
  merch: { x: 13, y: 10 },
};

export function buildBlocked(): Set<string> {
  const blocked = new Set<string>();
  for (let x = 0; x < GRID_W; x++) {
    blocked.add(key(x, 0));
    blocked.add(key(x, GRID_H - 1));
  }
  for (let y = 0; y < GRID_H; y++) {
    blocked.add(key(0, y));
    blocked.add(key(GRID_W - 1, y));
  }
  for (const f of FURNITURE) for (let x = f.x; x < f.x + f.w; x++) for (let y = f.y; y < f.y + f.h; y++) blocked.add(key(x, y));
  return blocked;
}

export function key(x: number, y: number) {
  return `${x},${y}`;
}
