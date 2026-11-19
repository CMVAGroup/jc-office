'use client';
// Levend kantoor: animatie draait lokaal in de browser; status komt uit de backend (SSE + statusrequest).
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DESK_SEATS,
  FURNITURE,
  GRID_H,
  GRID_W,
  iso,
  isoBox,
  isoRect,
  OfficeSim,
  ROLES,
  TILE_H,
  TILE_W,
  type EntityView,
  type Furniture,
  type OfficeIntents,
  type Role,
} from '@jc/ui';
import type { OfficeState } from '@/lib/office-state';

const ROLE_COLORS: Record<Role, string> = {
  lead: '#3d5a80',
  analyst: '#3d6b5e',
  growth: '#c0603a',
  retention: '#8a5a9e',
  cro: '#b38b2e',
  merch: '#5b7f3a',
};
const ROLE_SHORT: Record<Role, string> = { lead: 'Baas', analyst: 'Analist', growth: 'Growth', retention: 'Retentie', cro: 'CRO', merch: 'Ops' };

function readPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* geen opslag beschikbaar */
  }
}

function bark() {
  try {
    const ctx = new AudioContext();
    for (const [t, f] of [[0, 520], [0.18, 470]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.06, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.13);
    }
  } catch {
    /* audio niet beschikbaar */
  }
}

async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Fout ${r.status}`);
  return data;
}

export default function OfficeView({ initial, role }: { initial: OfficeState; role: string }) {
  const [state, setState] = useState<OfficeState>(initial);
  const [views, setViews] = useState<EntityView[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [panel, setPanel] = useState<'agent' | 'meeting' | 'alert' | null>(null);
  const [reduced, setReduced] = useState(false);
  const [sound, setSound] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const simRef = useRef<OfficeSim | null>(null);
  const seenAlerts = useRef<Set<string>>(new Set(initial.alerts.map((a) => a.id)));
  const canAct = role === 'owner' || role === 'operator';

  if (!simRef.current) simRef.current = new OfficeSim(Date.now() % 100000);

  // Voorkeuren (per kijker, lokaal)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(readPref('jc.reducedMotion', mq.matches));
    setSound(readPref('jc.sound', false));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/office/state', { cache: 'no-store' });
      if (r.ok) setState(await r.json());
    } catch {
      /* volgende poging */
    }
  }, []);

  // SSE met cursor; bij reconnect stuurt de browser Last-Event-ID. Fallback: periodieke statusrequest.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(`/api/events?cursor=${initial.cursor}`);
    es.addEventListener('open', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false));
    es.addEventListener('office', () => {
      if (t) clearTimeout(t);
      t = setTimeout(refresh, 250);
    });
    const poll = setInterval(refresh, 10_000);
    return () => {
      es.close();
      clearInterval(poll);
      if (t) clearTimeout(t);
    };
  }, [initial.cursor, refresh]);

  // Nieuwe alarmen: blaf (alleen als geluid aanstaat).
  useEffect(() => {
    for (const a of state.alerts) {
      if (!seenAlerts.current.has(a.id)) {
        seenAlerts.current.add(a.id);
        if (sound) bark();
      }
    }
  }, [state.alerts, sound]);

  const meeting = state.meeting;
  const visualSec = meeting?.endsAt ? (new Date(meeting.endsAt).getTime() - new Date(meeting.startedAt).getTime()) / 1000 : 0;
  const serverSkew = useMemo(() => new Date(state.now).getTime() - Date.now(), [state.now]);
  const elapsed = meeting ? ((clock + serverSkew - new Date(meeting.startedAt).getTime()) / 1000) * speed : 0;
  const meetingVisual = !!meeting && !skipped[meeting.id] && visualSec > 0 && elapsed < visualSec;

  const intents: OfficeIntents = useMemo(() => {
    const agents = Object.fromEntries(state.agents.map((a) => [a.role, { working: a.working, blocked: a.blocked }])) as OfficeIntents['agents'];
    const newest = state.alerts[state.alerts.length - 1];
    const alert = newest ? { role: newest.role as Role, cause: newest.cause } : null;
    return { meetingActive: meetingVisual, agents, alert, reducedMotion: reduced, workHours: state.workHours || !!alert };
  }, [state, meetingVisual, reduced]);
  const intentsRef = useRef(intents);
  intentsRef.current = intents;

  // Animatielus (alleen in de browser).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      simRef.current!.step(dt, intentsRef.current);
      acc += dt;
      if (acc > 1 / 30) {
        acc = 0;
        setViews(simRef.current!.views());
        setClock(Date.now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __office: unknown }).__office = {
      sim: simRef.current,
      views: () => simRef.current!.views(),
      enableTracking: () => {
        simRef.current!.trackVisits = true;
        simRef.current!.visited = [];
      },
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  // Welke agent spreekt nu? Verzamelen (30%) → updates op volgorde (55%) → synthese door de baas (15%).
  let speaking: { role: Role; text: string } | null = null;
  if (meetingVisual && meeting) {
    const p = elapsed / visualSec;
    if (p >= 0.3 && p < 0.85 && meeting.updates.length) {
      const idx = Math.min(meeting.updates.length - 1, Math.floor(((p - 0.3) / 0.55) * meeting.updates.length));
      const u = meeting.updates[idx]!;
      speaking = { role: u.role as Role, text: u.text };
    } else if (p >= 0.85) {
      const syn = meeting.synthesis as { summary?: string } | null;
      speaking = { role: 'lead', text: syn?.summary ?? meeting.synthesisError ?? 'Samenvatting niet beschikbaar' };
    }
  }

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const agentOf = (r: Role) => state.agents.find((a) => a.role === r)!;
  const alertFor = (r: Role) => state.alerts.find((a) => a.role === r);
  const dogView = views.find((v) => v.kind === 'dog');
  const newestAlert = state.alerts[state.alerts.length - 1];

  // ---- Tekenen ----
  const pad = 30;
  const minX = -GRID_H * (TILE_W / 2) - pad;
  const width = (GRID_W + GRID_H) * (TILE_W / 2) + pad * 2;
  const height = (GRID_W + GRID_H) * (TILE_H / 2) + 140;
  type Drawable = { k: number; el: React.ReactNode };
  const items: Drawable[] = [];

  for (const f of FURNITURE) items.push({ k: f.x + f.y + (f.w + f.h) / 2, el: <FurnitureShape key={f.id} f={f} state={state} onSelect={(r) => { setSelected(r); setPanel('agent'); }} /> });
  for (const v of views) items.push({ k: v.x + v.y + 1.01, el: <Figure key={v.id} v={v} /> });
  items.sort((a, b) => a.k - b.k);

  const bubbleAt = (cellX: number, cellY: number, text: string, cls = '', onClick?: () => void) => {
    const p = iso(cellX + 0.5, cellY + 0.5, 2.2);
    const t = text.length > 70 ? text.slice(0, 68) + '…' : text;
    const w = Math.min(320, 14 + t.length * 5.6);
    return (
      <g className={`bubble ${cls}`} transform={`translate(${p.sx - w / 2},${p.sy - 26})`} onClick={onClick} style={onClick ? { cursor: 'pointer', pointerEvents: 'all' } : undefined}>
        <rect width={w} height={22} rx={6} />
        <text x={7} y={15}>{t}</text>
      </g>
    );
  };

  return (
    <div className="office-layout">
      <section className={`office-stage ${reduced ? 'reduced' : ''}`} aria-label="Kantoorweergave">
        <div className="office-toolbar">
          <button className="primary" disabled={!canAct} onClick={() => act(() => post('/api/tasks', { type: 'morning_brief' }), 'Ochtendbrief in wachtrij gezet')}>
            Maak ochtendbrief
          </button>
          <button disabled={!canAct || !!meeting} onClick={() => act(() => post('/api/demo/meeting'), 'Demo-vergadering aangevraagd')} data-testid="demo-meeting">
            Vergadering nu (demo)
          </button>
          <button disabled={!canAct} onClick={() => act(() => post('/api/demo/stall', { role: 'growth' }), 'Demo: vastgelopen taak gestart bij Growth')} data-testid="demo-stall">
            Simuleer vastgelopen taak
          </button>
          <button disabled={!canAct} onClick={() => act(() => post('/api/demo/rate-limit'), 'Demo: rate-limit-taak gestart (geen alarm verwacht)')}>
            Simuleer rate limit
          </button>
          <label className="row small">
            <input type="checkbox" checked={reduced} onChange={(e) => { setReduced(e.target.checked); writePref('jc.reducedMotion', e.target.checked); }} />
            Verminderde beweging
          </label>
          <label className="row small">
            <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); writePref('jc.sound', e.target.checked); }} />
            Blafgeluid
          </label>
          <span className="small muted" title="Live-verbinding met de backend">
            <span className={`status-dot ${connected ? 'on' : 'off'}`} />
            {connected ? 'live' : 'verbinden…'} · worker <span className={`status-dot ${state.workerOnline ? 'on' : 'off'}`} />
            {state.workerOnline ? 'actief' : 'niet actief'}
          </span>
        </div>
        {msg && <div className="small" style={{ padding: '0.35rem 0.6rem' }} role="status">{msg}</div>}
        <svg viewBox={`${minX} -90 ${width} ${height}`} role="img" aria-label="Isometrisch kantoor met zes agents en een hond">
          {/* vloer */}
          {Array.from({ length: GRID_W - 2 }).flatMap((_, x) =>
            Array.from({ length: GRID_H - 2 }).map((__, y) => (
              <polygon key={`f${x}-${y}`} points={isoRect(x + 1, y + 1, 1, 1)} fill={(x + y) % 2 ? 'var(--floor-a)' : 'var(--floor-b)'} />
            )),
          )}
          {/* achterwanden */}
          <polygon points={isoBox(1, 0, GRID_W - 2, 1, 1.6).top} fill="var(--wall)" />
          <polygon points={isoBox(1, 0, GRID_W - 2, 1, 1.6).left} fill="var(--wall)" opacity={0.85} />
          <polygon points={isoBox(0, 1, 1, GRID_H - 2, 1.6).top} fill="var(--wall)" />
          <polygon points={isoBox(0, 1, 1, GRID_H - 2, 1.6).right} fill="var(--wall)" opacity={0.7} />
          {items.map((i) => i.el)}
          {/* tekstballonnen */}
          {speaking && (() => {
            const e = views.find((v) => v.role === speaking!.role);
            return e ? bubbleAt(e.x, e.y, `${ROLE_SHORT[speaking.role]}: ${speaking.text}`) : null;
          })()}
          {meetingVisual && meeting && elapsed / visualSec < 0.3 && bubbleAt(9.5, 6.5, `${meeting.title}: iedereen naar de vergadertafel`)}
          {dogView && newestAlert && dogView.state === 'alerting' &&
            bubbleAt(dogView.x, dogView.y, `Woef! ${newestAlert.stateLabel} — ${newestAlert.cause}`, 'alert-bubble', () => setPanel('alert'))}
          {meetingVisual &&
            state.agents
              .filter((a) => a.working)
              .map((a) => {
                const e = views.find((v) => v.role === a.role);
                return e ? <g key={`bg-${a.role}`}>{bubbleAt(e.x, e.y - 1.2, 'taak loopt op achtergrond')}</g> : null;
              })}
        </svg>

        {panel && (
          <div className="card panel-overlay" role="dialog" aria-label="Details">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{panel === 'agent' && selected ? agentOf(selected).label : panel === 'meeting' ? 'Vergadering' : 'Waarschuwing van de hond'}</strong>
              <button onClick={() => setPanel(null)} aria-label="Sluiten">×</button>
            </div>
            {panel === 'agent' && selected && <AgentPanel a={agentOf(selected)} alert={alertFor(selected)} />}
            {panel === 'alert' && newestAlert && <AlertPanel a={newestAlert} />}
            {panel === 'meeting' && meeting && <MeetingPanel m={meeting} />}
          </div>
        )}
      </section>

      <aside className="side-panel" aria-label="Activiteitenpaneel">
        {meeting && (
          <div className="card notice">
            <strong>{meeting.title}</strong> {meeting.isDemo && <span className="badge demo">demo</span>} {meeting.late && <span className="badge">verlaat</span>}
            <div className="small muted">Verslag en acties zijn al opgeslagen; de animatie verandert niets aan resultaten.</div>
            <div className="row" style={{ marginTop: '0.4rem' }}>
              <button onClick={() => setPanel('meeting')}>Open vergadering</button>
              <button onClick={() => setSpeed((s) => (s === 1 ? 3 : 1))}>{speed === 1 ? 'Versnel ×3' : 'Normale snelheid'}</button>
              <button onClick={() => { setSkipped((s) => ({ ...s, [meeting.id]: true })); setPanel('meeting'); }}>Animatie overslaan</button>
              <Link href={`/vergaderingen/${meeting.id}`}>Verslag</Link>
            </div>
          </div>
        )}
        {state.alerts.length > 0 && (
          <div className="card alert-box" data-testid="alerts">
            <strong>Waarschuwingen (watchdog)</strong>
            <ul className="clean small">
              {state.alerts.map((a) => (
                <li key={a.id}>
                  <strong>{ROLE_SHORT[a.role]}</strong>: {a.stateLabel} — {a.cause} · <Link href={`/taken/${a.taskId}`}>taak</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="card">
          <strong>Agents</strong>
          <ul className="clean small" data-testid="agent-list">
            {ROLES.map((r) => {
              const a = agentOf(r);
              const v = views.find((x) => x.role === r);
              return (
                <li key={r}>
                  <button className="small" onClick={() => { setSelected(r); setPanel('agent'); }} aria-label={`Open ${a.label}`}>
                    {a.label}
                  </button>{' '}
                  <span className="badge">{v?.state ?? 'idle'}</span>{' '}
                  {!a.implemented && <span className="badge">fase 2+</span>}
                  <div className="muted">
                    {a.activeTask ? (
                      <>
                        <Link href={`/taken/${a.activeTask.id}`}>{a.activeTask.title}</Link> · <span className={`badge ${a.activeTask.status}`}>{a.activeTask.status}</span>
                        {a.activeTask.progressNote ? ` · ${a.activeTask.progressNote}` : ''}
                      </>
                    ) : (
                      'Geen actieve taak'
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card small">
          <strong>Kantoorhond</strong>: {dogView?.state ?? 'resting'} · bewaakt heartbeats, voortgang, deadlines en wachtrij. Geen taalmodel, voert zelf niets uit.
          <div className="muted">Model: {state.modelMode.isMock ? 'mockadapter' : state.modelMode.provider} · {state.pendingApprovals} voorstel(len) wachten op goedkeuring</div>
        </div>
      </aside>
    </div>
  );
}

function FurnitureShape({ f, state, onSelect }: { f: Furniture; state: OfficeState; onSelect: (r: Role) => void }) {
  const b = isoBox(f.x, f.y, f.w, f.h, f.height);
  const colors: Record<Furniture['kind'], [string, string, string]> = {
    desk: ['var(--wood-top)', 'var(--wood-l)', 'var(--wood-r)'],
    boss_desk: ['#8f6a4a', '#74533a', '#654731'],
    table: ['#b9a58b', '#9c8a72', '#8b7a64'],
    cabinet: ['#a9b2b8', '#8e979d', '#7f878d'],
    plant: ['#5f8f55', '#4d7645', '#43673c'],
    sofa: ['#7d8fa8', '#677a92', '#5b6c82'],
    basket: ['#c49a5e', '#a98249', '#96733f'],
  };
  const [top, l, r] = colors[f.kind];
  const agent = f.role ? state.agents.find((a) => a.role === f.role) : null;
  const shape = (
    <>
      <polygon points={b.left} fill={l} />
      <polygon points={b.right} fill={r} />
      <polygon className="top" points={b.top} fill={top} />
    </>
  );
  if (!f.role) {
    return (
      <g>
        {shape}
        {f.kind === 'basket' && <polygon points={isoRect(f.x + 0.15, f.y + 0.15, 0.7, 0.7, f.height)} fill="#e8d7bd" />}
      </g>
    );
  }
  const seat = DESK_SEATS[f.role];
  const m = iso(f.x + f.w / 2, f.y + 0.5, f.height);
  const label = iso(f.x + f.w / 2, f.y, f.height + 1.7);
  const status = agent?.blocked ? 'var(--warn)' : agent?.working ? 'var(--accent)' : 'var(--ink-2)';
  return (
    <g
      className={`desk-hit ${agent?.working ? 'working' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Bureau ${agent?.label ?? f.role}: ${agent?.activeTask?.title ?? 'geen actieve taak'}`}
      onClick={() => onSelect(f.role!)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(f.role!);
      }}
      data-testid={`desk-${f.role}`}
    >
      {shape}
      {/* stoel */}
      <polygon points={isoRect(seat.x + 0.25, seat.y + 0.25, 0.5, 0.5, 0.25)} fill="#55514b" opacity={0.6} />
      {/* monitor */}
      <rect x={m.sx - 9} y={m.sy - 18} width={18} height={12} rx={2} fill="#2b2f33" />
      <rect className="screen" x={m.sx - 7} y={m.sy - 16} width={14} height={8} rx={1} fill={agent?.working ? '#8fd3c0' : '#4b5560'} />
      <circle cx={label.sx} cy={label.sy - 4} r={5} fill={status} />
      <text x={label.sx + 8} y={label.sy} fontSize={11} fill="var(--ink)" fontWeight={600}>
        {f.label ?? ROLE_SHORT[f.role]}
      </text>
    </g>
  );
}

function Figure({ v }: { v: EntityView }) {
  const p = iso(v.x + 0.5, v.y + 0.5);
  const seated = !v.moving && (v.state === 'working' || v.state === 'idle' || v.state === 'meeting' || v.state === 'blocked');
  if (v.kind === 'dog') {
    const lying = v.state === 'resting';
    return (
      <g transform={`translate(${p.sx},${p.sy}) scale(${v.facing},1)`} className={`dog ${v.moving ? 'walking' : ''}`} data-testid="dog" data-state={v.state}>
        <ellipse cx={0} cy={2} rx={11} ry={4} fill="rgb(0 0 0 / 18%)" />
        <g className="bob">
          {!lying && <rect x={-7} y={-6} width={2.5} height={7} fill="#6b4a2c" />}
          {!lying && <rect x={4} y={-6} width={2.5} height={7} fill="#6b4a2c" />}
          <ellipse cx={0} cy={lying ? -3 : -9} rx={10} ry={5} fill="#8b5e34" />
          <circle cx={9} cy={lying ? -6 : -14} r={4.5} fill="#8b5e34" />
          <ellipse cx={11} cy={lying ? -9 : -18} rx={1.8} ry={3} fill="#5d3d20" />
          <circle cx={11} cy={lying ? -6 : -14.5} r={0.9} fill="#111" />
          <g className="tail" transform={`translate(-10,${lying ? -4 : -11})`}>
            <rect x={-6} y={-1} width={6} height={2} rx={1} fill="#6b4a2c" />
          </g>
          {v.state === 'alerting' && <text x={-3} y={-26} fontSize={14} fontWeight={800} fill="var(--warn)">!</text>}
        </g>
      </g>
    );
  }
  const role = v.role!;
  const color = ROLE_COLORS[role];
  const lift = seated ? 4 : 0;
  return (
    <g transform={`translate(${p.sx},${p.sy})`} className={`agent ${v.moving ? 'walking' : ''} ${v.state}`} data-testid={`agent-${role}`} data-state={v.state}>
      <ellipse cx={0} cy={2} rx={9} ry={4} fill="rgb(0 0 0 / 18%)" />
      <g className="bob" transform={`translate(0,${lift})`}>
        {!seated && <rect x={-5} y={-10} width={3.5} height={10} rx={1} fill="#3a3a3a" />}
        {!seated && <rect x={1.5} y={-10} width={3.5} height={10} rx={1} fill="#3a3a3a" />}
        <rect x={-7} y={-26} width={14} height={17} rx={5} fill={color} />
        <circle cx={0} cy={-32} r={6.5} fill="#e9c6a5" />
        <path d="M -6.5 -33 Q 0 -42 6.5 -33 Q 3 -37 -6.5 -33 Z" fill="#3b2a20" />
        {role === 'lead' && <rect x={-1.2} y={-25} width={2.4} height={9} fill="#d4af37" />}
        {role === 'lead' && <path d="M -5 -40 L -3 -44 L 0 -41 L 3 -44 L 5 -40 Z" fill="#d4af37" />}
        {v.state === 'blocked' && <circle cx={9} cy={-36} r={4} fill="var(--warn)" />}
      </g>
    </g>
  );
}

function AgentPanel({ a, alert }: { a: OfficeState['agents'][number]; alert?: OfficeState['alerts'][number] }) {
  return (
    <div className="small">
      {!a.implemented && <p className="badge">Rol nog niet geactiveerd in fase 1</p>}
      <p>{a.goal}</p>
      {alert && (
        <p className="card alert-box">
          <strong>{alert.stateLabel}</strong>: {alert.cause} · <Link href={`/taken/${alert.taskId}`}>open taak</Link>
        </p>
      )}
      <h3>Actieve taak</h3>
      {a.activeTask ? (
        <p>
          <Link href={`/taken/${a.activeTask.id}`}>{a.activeTask.title}</Link> <span className={`badge ${a.activeTask.status}`}>{a.activeTask.status}</span>
          <br />
          <span className="muted">{a.activeTask.progressNote}</span>
        </p>
      ) : (
        <p className="muted">Geen actieve taak — rusten is geen fout.</p>
      )}
      <h3>Recente taken</h3>
      <ul className="clean">
        {a.recentTasks.length ? a.recentTasks.map((t) => (
          <li key={t.id}>
            <Link href={`/taken/${t.id}`}>{t.title}</Link> <span className={`badge ${t.status}`}>{t.status}</span>
          </li>
        )) : <li className="muted">Nog geen taken</li>}
      </ul>
      <h3>Toegestane tools</h3>
      <p className="mono">{a.allowedTools.join(', ')}</p>
      <h3>Grenzen</h3>
      <ul>{a.limits.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function AlertPanel({ a }: { a: OfficeState['alerts'][number] }) {
  return (
    <div className="small">
      <p>
        <strong>{a.stateLabel}</strong> bij {ROLE_SHORT[a.role]} sinds {new Date(a.openedAt).toLocaleTimeString('nl-NL')}
      </p>
      <p>Oorzaak (uit de backend): {a.cause}</p>
      <p className="muted">De hond markeert niets als geslaagd, probeert niets opnieuw en voert geen externe acties uit. De baas/eigenaar beslist.</p>
      <Link href={`/taken/${a.taskId}`}>Open taak en laatste status</Link>
    </div>
  );
}

function MeetingPanel({ m }: { m: NonNullable<OfficeState['meeting']> }) {
  const syn = m.synthesis as null | {
    summary: string;
    priorities: { title: string; ownerRole: string; evidence: { kind: string; id: string }[] }[];
    ownerDecisions: { question: string }[];
  };
  return (
    <div className="small">
      <p>
        <strong>{m.title}</strong> {m.isDemo && <span className="badge demo">demo</span>}
      </p>
      <ol>
        {m.updates.map((u) => (
          <li key={u.role}>
            <strong>{ROLE_SHORT[u.role as Role]}</strong>: {u.text} {u.staleInput && <span className="badge partial">verouderde input</span>}{' '}
            {u.evidence.slice(0, 3).map((e) => (
              <Link key={e.id} href={`/taken/${e.id}`}> [taak]</Link>
            ))}
          </li>
        ))}
      </ol>
      <h3>Synthese van de baas</h3>
      {syn ? (
        <>
          <p>{syn.summary}</p>
          <ol>{syn.priorities.map((p) => <li key={p.title}>{p.title} — <em>{p.ownerRole}</em></li>)}</ol>
          {syn.ownerDecisions.length > 0 && (
            <>
              <h3>Beslissingen voor de eigenaar</h3>
              <ul>{syn.ownerDecisions.map((d) => <li key={d.question}>{d.question}</li>)}</ul>
            </>
          )}
          <p className="muted">Deze vergadering geeft geen toestemming voor externe wijzigingen.</p>
        </>
      ) : (
        <p className="muted">{m.synthesisError ?? 'Synthese niet beschikbaar.'}</p>
      )}
      <Link href={`/vergaderingen/${m.id}`}>Volledig verslag</Link>
    </div>
  );
}
