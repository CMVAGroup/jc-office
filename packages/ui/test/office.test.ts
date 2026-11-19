import { describe, expect, it } from 'vitest';
import { buildBlocked, DESK_SEATS, DOG_INSPECT_POINTS, findPath, key, MEETING_SEATS, OfficeSim, ROLES, type OfficeIntents } from '../src';

const idle = Object.fromEntries(ROLES.map((r) => [r, { working: false, blocked: false }])) as OfficeIntents['agents'];
const base: OfficeIntents = { meetingActive: false, agents: idle, alert: null, reducedMotion: false, workHours: true };

function run(sim: OfficeSim, intents: OfficeIntents, maxSec: number, until: () => boolean) {
  for (let t = 0; t < maxSec; t += 1 / 30) {
    sim.step(1 / 30, intents);
    if (until()) return t;
  }
  return Infinity;
}

describe('navgrid en A*', () => {
  it('alle stoelen zijn begaanbaar en onderling bereikbaar', () => {
    const blocked = buildBlocked();
    for (const r of ROLES) {
      for (const c of [DESK_SEATS[r], MEETING_SEATS[r], DOG_INSPECT_POINTS[r]]) expect(blocked.has(key(c.x, c.y))).toBe(false);
      const p = findPath(DESK_SEATS[r], MEETING_SEATS[r], blocked);
      expect(p).not.toBeNull();
      for (const c of p!) expect(blocked.has(key(c.x, c.y))).toBe(false);
    }
  });
  it('vaste stoelen zijn uniek', () => {
    const all = ROLES.flatMap((r) => [DESK_SEATS[r], MEETING_SEATS[r]]).map((c) => key(c.x, c.y));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('loopwereld', () => {
  it('alle poppetjes bereiken de vergadertafel zonder door meubels te lopen en keren terug', () => {
    const sim = new OfficeSim(7);
    sim.trackVisits = true;
    const tMeet = run(sim, { ...base, meetingActive: true }, 60, () => sim.allAgentsAt('meeting'));
    expect(tMeet).toBeLessThan(30);
    for (const r of ROLES) expect(sim.views().find((v) => v.role === r)!.state).toBe('meeting');
    const tBack = run(sim, base, 60, () => sim.allAgentsAt('desk'));
    expect(tBack).toBeLessThan(30);
    const blocked = buildBlocked();
    expect(sim.visited.length).toBeGreaterThan(20);
    for (const v of sim.visited) expect(blocked.has(key(v.cell.x, v.cell.y)), `${v.id} op ${v.cell.x},${v.cell.y}`).toBe(false);
  });

  it('bij een alarm loopt de hond naar het juiste bureau en toont alerting', () => {
    const sim = new OfficeSim(3);
    const t = run(sim, { ...base, alert: { role: 'growth', cause: 'Geen voortgang' } }, 30, () => {
      const d = sim.dog;
      return d.t >= 1 && d.to.x === DOG_INSPECT_POINTS.growth.x && d.to.y === DOG_INSPECT_POINTS.growth.y;
    });
    expect(t).toBeLessThan(20);
    expect(sim.views().find((v) => v.kind === 'dog')!.state).toBe('alerting');
  });

  it('zonder alarm patrouilleert, inspecteert of rust de hond — nooit alerting', () => {
    const sim = new OfficeSim(11);
    const states = new Set<string>();
    run(sim, base, 90, () => {
      states.add(sim.views().find((v) => v.kind === 'dog')!.state);
      return false;
    });
    expect(states.has('alerting')).toBe(false);
    expect([...states].some((s) => s === 'patrolling' || s === 'inspecting')).toBe(true);
  });

  it('verminderde beweging: direct op de bestemming, geen loopanimatie', () => {
    const sim = new OfficeSim(1);
    sim.step(1 / 30, { ...base, meetingActive: true, reducedMotion: true });
    expect(sim.allAgentsAt('meeting')).toBe(true);
    expect(sim.views().every((v) => !v.moving)).toBe(true);
  });

  it('werkstatus en positie zijn gescheiden: werkend personage in vergadering toont meeting', () => {
    const sim = new OfficeSim(1);
    const agents = { ...idle, analyst: { working: true, blocked: false } };
    sim.step(1 / 30, { ...base, agents, reducedMotion: true });
    expect(sim.views().find((v) => v.role === 'analyst')!.state).toBe('working');
    sim.step(1 / 30, { ...base, agents, meetingActive: true, reducedMotion: true });
    expect(sim.views().find((v) => v.role === 'analyst')!.state).toBe('meeting');
  });
});
