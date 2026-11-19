// A* op een 4-verbonden grid (geen diagonalen → nooit hoeken van meubels afsnijden).
import { GRID_H, GRID_W, key, type Cell } from './layout';

export function findPath(start: Cell, goal: Cell, blocked: Set<string>, extraBlocked?: Set<string>): Cell[] | null {
  const isFree = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !blocked.has(key(x, y)) && !(extraBlocked?.has(key(x, y)) ?? false);
  if (!isFree(goal.x, goal.y) && !(goal.x === start.x && goal.y === start.y)) return null;
  const startK = key(start.x, start.y);
  const goalK = key(goal.x, goal.y);
  const h = (c: Cell) => Math.abs(c.x - goal.x) + Math.abs(c.y - goal.y);
  const open: { c: Cell; f: number; g: number }[] = [{ c: start, f: h(start), g: 0 }];
  const came = new Map<string, string>();
  const gScore = new Map<string, number>([[startK, 0]]);
  const closed = new Set<string>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f || (open[i]!.f === open[bi]!.f && open[i]!.g > open[bi]!.g)) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    const ck = key(cur.c.x, cur.c.y);
    if (ck === goalK) {
      const path: Cell[] = [];
      let k: string | undefined = ck;
      while (k && k !== startK) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        path.unshift({ x, y });
        k = came.get(k);
      }
      return path;
    }
    if (closed.has(ck)) continue;
    closed.add(ck);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.c.x + dx;
      const ny = cur.c.y + dy;
      if (!isFree(nx, ny)) continue;
      const nk = key(nx, ny);
      const g = cur.g + 1;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        came.set(nk, ck);
        open.push({ c: { x: nx, y: ny }, g, f: g + h({ x: nx, y: ny }) });
      }
    }
  }
  return null;
}
