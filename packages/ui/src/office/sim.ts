// Loopwereld: draait alleen in de browser (of headless in tests). Leest gezaghebbende status uit de backend
// (via OfficeIntents) maar bepaalt zelf de frame-animatie. Visuele positie ≠ werkstatus.
import { findPath } from './astar';
import { buildBlocked, DESK_SEATS, DOG_BED, DOG_INSPECT_POINTS, key, MEETING_SEATS, ROLES, type Cell, type Role } from './layout';

export type AgentVisual = 'idle' | 'walking' | 'working' | 'meeting' | 'blocked';
export type DogVisual = 'patrolling' | 'inspecting' | 'alerting' | 'resting';

export interface OfficeIntents {
  meetingActive: boolean;
  agents: Record<Role, { working: boolean; blocked: boolean }>;
  /** Alarm van de watchdog: hond loopt naar dit bureau. */
  alert: { role: Role; cause: string } | null;
  reducedMotion: boolean;
  /** Buiten werktijd mag de hond rusten. */
  workHours: boolean;
}

export interface Entity {
  id: string;
  kind: 'agent' | 'dog';
  role?: Role;
  from: Cell;
  to: Cell;
  t: number; // 0..1 voortgang van from → to
  path: Cell[];
  goal: Cell;
  waitSec: number;
  facing: 1 | -1;
  agentState: AgentVisual;
  dogState: DogVisual;
  dogTimer: number;
}

export interface EntityView {
  id: string;
  kind: 'agent' | 'dog';
  role?: Role;
  x: number;
  y: number;
  state: AgentVisual | DogVisual;
  facing: 1 | -1;
  moving: boolean;
}

const SPEED = 3; // cellen per seconde
const DOG_SPEED = 3.6;

function eq(a: Cell, b: Cell) {
  return a.x === b.x && a.y === b.y;
}

export function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export class OfficeSim {
  readonly blocked = buildBlocked();
  entities: Entity[] = [];
  /** Alle cellen die ooit betreden zijn (voor tests: nooit door meubels). */
  visited: { id: string; cell: Cell }[] = [];
  trackVisits = false;
  private rng: () => number;
  private lastIntents: OfficeIntents | null = null;

  constructor(seed = 42) {
    this.rng = seededRng(seed);
    for (const role of ROLES) {
      const c = DESK_SEATS[role];
      this.entities.push(this.mk(`agent-${role}`, 'agent', c, role));
    }
    this.entities.push(this.mk('dog', 'dog', DOG_BED));
    this.dog.dogState = 'resting';
    this.dog.dogTimer = 4;
  }

  private mk(id: string, kind: 'agent' | 'dog', c: Cell, role?: Role): Entity {
    return { id, kind, role, from: { ...c }, to: { ...c }, t: 1, path: [], goal: { ...c }, waitSec: 0, facing: 1, agentState: 'idle', dogState: 'patrolling', dogTimer: 0 };
  }

  get dog(): Entity {
    return this.entities.find((e) => e.kind === 'dog')!;
  }

  agent(role: Role): Entity {
    return this.entities.find((e) => e.role === role)!;
  }

  /** Huidige (gereserveerde) cellen van anderen. */
  private occupied(except: Entity): Set<string> {
    const s = new Set<string>();
    for (const e of this.entities) {
      if (e === except) continue;
      s.add(key(e.from.x, e.from.y));
      s.add(key(e.to.x, e.to.y));
    }
    return s;
  }

  private setGoal(e: Entity, goal: Cell) {
    if (eq(e.goal, goal) && (e.path.length || eq(e.to, goal))) return;
    e.goal = { ...goal };
    e.path = findPath(e.to, goal, this.blocked) ?? [];
    e.waitSec = 0;
  }

  private teleport(e: Entity, c: Cell) {
    e.from = { ...c };
    e.to = { ...c };
    e.t = 1;
    e.path = [];
    e.goal = { ...c };
  }

  arrived(e: Entity) {
    return e.t >= 1 && e.path.length === 0 && eq(e.to, e.goal);
  }

  private updateDog(dt: number, intents: OfficeIntents) {
    const d = this.dog;
    if (intents.alert) {
      const target = DOG_INSPECT_POINTS[intents.alert.role];
      if (d.dogState !== 'alerting' || !eq(d.goal, target)) this.setGoal(d, target);
      d.dogState = 'alerting';
      return;
    }
    if (d.dogState === 'alerting') {
      d.dogState = 'patrolling';
      this.setGoal(d, DOG_BED);
    }
    if (!intents.workHours) {
      if (!eq(d.goal, DOG_BED)) this.setGoal(d, DOG_BED);
      d.dogState = this.arrived(d) ? 'resting' : 'patrolling';
      return;
    }
    if (!this.arrived(d)) {
      d.dogState = 'patrolling';
      return;
    }
    // Aangekomen: rusten in de mand of even snuffelen bij een bureau.
    d.dogTimer -= dt;
    if (eq(d.to, DOG_BED)) d.dogState = 'resting';
    else if (d.dogState !== 'resting') d.dogState = 'inspecting';
    if (d.dogTimer > 0) return;
    const r = this.rng();
    if (r < 0.25) {
      this.setGoal(d, DOG_BED);
      d.dogTimer = 6 + this.rng() * 6;
    } else {
      const role = ROLES[Math.floor(this.rng() * ROLES.length)]!;
      this.setGoal(d, DOG_INSPECT_POINTS[role]);
      d.dogTimer = 1.5 + this.rng() * 2;
    }
    d.dogState = 'patrolling';
  }

  step(dt: number, intents: OfficeIntents) {
    this.lastIntents = intents;
    for (const role of ROLES) {
      const e = this.agent(role);
      this.setGoal(e, intents.meetingActive ? MEETING_SEATS[role] : DESK_SEATS[role]);
    }
    this.updateDog(dt, intents);

    if (intents.reducedMotion) {
      for (const e of this.entities) if (!this.arrived(e)) this.teleport(e, e.goal);
    } else {
      for (const e of this.entities) this.move(e, dt);
    }

    for (const role of ROLES) {
      const e = this.agent(role);
      const a = intents.agents[role];
      if (!this.arrived(e)) e.agentState = 'walking';
      else if (intents.meetingActive) e.agentState = 'meeting';
      else if (a?.blocked) e.agentState = 'blocked';
      else if (a?.working) e.agentState = 'working';
      else e.agentState = 'idle';
    }
  }

  private move(e: Entity, dt: number) {
    let budget = dt * (e.kind === 'dog' ? DOG_SPEED : SPEED);
    while (budget > 0) {
      if (e.t < 1) {
        const need = 1 - e.t;
        const used = Math.min(need, budget);
        e.t += used;
        budget -= used;
        if (e.t >= 1) {
          e.t = 1;
          e.from = { ...e.to };
        }
        continue;
      }
      const next = e.path[0];
      if (!next) return;
      const occ = this.occupied(e);
      if (occ.has(key(next.x, next.y)) && e.waitSec < 3) {
        // Eenvoudige uitwijking: kort wachten, dan omrijden rond de ander.
        e.waitSec += dt;
        if (e.waitSec > 0.5) {
          const alt = findPath(e.to, e.goal, this.blocked, occ);
          if (alt && alt.length && !occ.has(key(alt[0]!.x, alt[0]!.y))) {
            e.path = alt;
            e.waitSec = 0;
          }
        }
        return;
      }
      // Laatste redmiddel na 3 s: langs elkaar heen schuiven (nooit door meubels — pad is meubelvrij).
      e.waitSec = 0;
      e.path.shift();
      if (this.blocked.has(key(next.x, next.y))) throw new Error(`Pad door meubel bij ${next.x},${next.y}`);
      if (next.x !== e.from.x) e.facing = next.x > e.from.x ? 1 : -1;
      else if (next.y !== e.from.y) e.facing = next.y > e.from.y ? -1 : 1;
      e.to = { ...next };
      e.t = 0;
      if (this.trackVisits) this.visited.push({ id: e.id, cell: { ...next } });
    }
  }

  views(): EntityView[] {
    return this.entities.map((e) => ({
      id: e.id,
      kind: e.kind,
      role: e.role,
      x: e.from.x + (e.to.x - e.from.x) * e.t,
      y: e.from.y + (e.to.y - e.from.y) * e.t,
      state: e.kind === 'dog' ? e.dogState : e.agentState,
      facing: e.facing,
      moving: e.t < 1 || e.path.length > 0,
    }));
  }

  allAgentsAt(target: 'desk' | 'meeting'): boolean {
    const seats = target === 'desk' ? DESK_SEATS : MEETING_SEATS;
    return ROLES.every((r) => {
      const e = this.agent(r);
      return e.t >= 1 && eq(e.to, seats[r]);
    });
  }

  get intents() {
    return this.lastIntents;
  }
}
