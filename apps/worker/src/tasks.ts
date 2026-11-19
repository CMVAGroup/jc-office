// Taakverwerking. Vaste workflowgrafiek: ochtendbrief = Lead → (deeltaak) Analyst → Lead-synthese.
// Geen recursieve delegatie; maximaal één deeltaak per brief.
import {
  invokeTool,
  ROLE_CONFIGS,
  runValidated,
  roleModelTools,
  SYSTEM_PROMPTS,
  type AnalystInput,
  type LeadInput,
  type ToolCallRecord,
} from '@jc/agents';
import {
  claimTask,
  createTask,
  emitEvent,
  heartbeatTask,
  Prisma,
  releaseParentIfReady,
  reportProgress,
  TaskConflictError,
  transitionTask,
  type Db,
} from '@jc/db';
import {
  emptyKnownEvidence,
  localDateString,
  METRIC_LABELS,
  RESULT_SCHEMA_VERSION,
  type AgentRole,
  type EvidenceRefT,
  type MorningBrief,
  type SchemaName,
  type TaskResult,
} from '@jc/domain';
import type { WorkerDeps } from './deps';
import { computeAndStoreMetrics, defaultPeriod, freshnessFor } from './metrics-service';
import { toolImpl } from './tool-impl';
import { startMeeting } from './meetings';
import { syncCmva } from './cmva-sync';

type TaskRow = Awaited<ReturnType<Db['task']['findUniqueOrThrow']>>;

class TaskAbort extends Error {}

export async function saveArtifact(
  db: Db,
  t: { workspaceId: string; taskId: string | null; kind: string; schemaName: SchemaName; content: TaskResult | MorningBrief; isDemo: boolean },
) {
  const art = await db.artifact.create({
    data: {
      workspaceId: t.workspaceId,
      taskId: t.taskId,
      kind: t.kind,
      schemaName: t.schemaName,
      schemaVersion: RESULT_SCHEMA_VERSION,
      content: t.content as unknown as Prisma.InputJsonValue,
      isDemo: t.isDemo,
    },
  });
  const refs: EvidenceRefT[] = [...t.content.sourceRecords, ...t.content.facts.flatMap((f) => f.evidence)];
  if ('priorities' in t.content) refs.push(...t.content.priorities.flatMap((p) => p.evidence));
  const uniq = new Map(refs.map((r) => [`${r.kind}:${r.id}`, r]));
  await db.evidenceRef.createMany({
    data: [...uniq.values()].map((r) => ({ workspaceId: t.workspaceId, artifactId: art.id, refKind: r.kind, refId: r.id, label: r.label ?? null })),
  });
  await db.finding.createMany({
    data: [
      ...t.content.facts.map((f) => ({
        workspaceId: t.workspaceId,
        artifactId: art.id,
        kind: 'fact',
        statement: f.statement,
        metricSnapshotId: f.evidence.find((e) => e.kind === 'metric_snapshot')?.id ?? null,
      })),
      ...t.content.hypotheses.map((h) => ({ workspaceId: t.workspaceId, artifactId: art.id, kind: 'hypothesis', statement: h.statement })),
    ],
  });
  return art;
}

async function assertBudget(deps: WorkerDeps, workspaceId: string) {
  if (deps.adapter.isMock) return;
  const since = new Date(Date.now() - 24 * 3600e3);
  const agg = await deps.db.agentRun.aggregate({ where: { workspaceId, startedAt: { gte: since } }, _sum: { costUsdMicros: true } });
  const spentUsd = (agg._sum.costUsdMicros ?? 0) / 1e6;
  if (spentUsd >= (deps.dailyBudgetUsd ?? 5)) throw new TaskAbort(`Dagelijks modelbudget bereikt (${spentUsd.toFixed(2)} USD).`);
}

/** Eén modelrun met registratie in agent_runs, schema-validatie en evidencecontrole. */
async function modelStep<T>(
  deps: WorkerDeps,
  task: TaskRow,
  role: AgentRole,
  schemaName: SchemaName,
  system: string,
  input: unknown,
  known: ReturnType<typeof emptyKnownEvidence>,
  toolCalls: ToolCallRecord[],
): Promise<T> {
  await assertBudget(deps, task.workspaceId);
  const cfg = ROLE_CONFIGS[role];
  const run = await deps.db.agentRun.create({
    data: {
      workspaceId: task.workspaceId, taskId: task.id, agentRole: role, promptVersion: cfg.promptVersion,
      modelProvider: deps.adapter.name, modelAlias: deps.adapter.model, status: 'running', attempt: task.attempts,
    },
  });
  await emitEvent(deps.db, { workspaceId: task.workspaceId, kind: 'agent_run.started', taskId: task.id, agentRole: role, payload: { runId: run.id, provider: deps.adapter.name } });
  try {
    const res = await deps.sem.run(() => runValidated<T>(deps.adapter, { schemaName, system, input, maxTokens: cfg.tokenBudget,
      ...(deps.adapter.name === 'ollama' ? { tools: roleModelTools(role, toolImpl(deps.db), { workspaceId: task.workspaceId, taskId: task.id }, toolCalls) } : {}),
    }, known));
    const usage = res.attempts.reduce(
      (a, r) => ({ i: a.i + r.usage.inputTokens, o: a.o + r.usage.outputTokens, c: a.c + r.usage.costUsdMicros }),
      { i: 0, o: 0, c: 0 },
    );
    await deps.db.agentRun.update({
      where: { id: run.id },
      data: {
        status: res.ok ? 'succeeded' : 'failed', finishedAt: new Date(), repairAttempted: res.repairAttempted,
        inputTokens: usage.i, outputTokens: usage.o, costUsdMicros: usage.c,
        toolCalls: toolCalls as unknown as Prisma.InputJsonValue, error: res.ok ? null : res.reason,
      },
    });
    if (!res.ok) throw new TaskAbort(res.reason);
    return res.output;
  } catch (e) {
    await deps.db.agentRun.updateMany({ where: { id: run.id, status: 'running' }, data: { status: 'failed', finishedAt: new Date(), error: String((e as Error).message) } });
    throw e;
  }
}

async function runAnalyst(deps: WorkerDeps, task: TaskRow) {
  const { db, workerId } = deps;
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: task.workspaceId } });
  const input = task.input as { fromLocal?: string; toLocal?: string };
  const range = input.fromLocal && input.toLocal ? { fromLocal: input.fromLocal, toLocal: input.toLocal } : defaultPeriod(new Date(), ws.reportingTimezone);
  const m = await computeAndStoreMetrics(db, task.workspaceId, range, task.id);
  await reportProgress(db, task.id, workerId, `Metrics berekend (${m.views.length} snapshots + basislijn)`);

  // Agent-runner haalt aanvullende data uitsluitend via de toegestane tools.
  const toolCalls: ToolCallRecord[] = [];
  const ctx = { workspaceId: task.workspaceId, taskId: task.id };
  const impl = toolImpl(db);
  await invokeTool('analyst', 'metrics.read', range, impl, ctx, toolCalls);
  const skus = (await db.variant.findMany({ where: { workspaceId: task.workspaceId }, select: { sku: true } })).map((v) => v.sku);
  const lookup = (await invokeTool('analyst', 'products.lookup', { skus }, impl, ctx, toolCalls)) as {
    inventory: { id: string; sku: string; available: number }[];
  };
  const latestInv = new Map<string, { id: string; sku: string; available: number }>();
  for (const i of lookup.inventory) if (!latestInv.has(i.sku)) latestInv.set(i.sku, i);

  const aInput: AnalystInput = {
    period: { from: range.fromLocal, to: range.toLocal, timezone: ws.reportingTimezone },
    metrics: m.views,
    baseline: m.baseline,
    freshness: await freshnessFor(db, task.workspaceId),
    inventory: [...latestInv.values()].map((i) => ({ recordId: i.id, sku: i.sku, available: i.available })),
    isDemo: ws.isDemo,
  };
  const known = emptyKnownEvidence();
  for (const v of m.views) known.metricSnapshots.set(v.snapshotId, { metricKey: v.key, value: v.value });
  for (const b of m.baseline) known.metricSnapshots.set(b.snapshotId, { metricKey: b.key, value: b.value });
  for (const i of aInput.inventory) known.sourceRecords.add(i.recordId);

  const output = await modelStep<TaskResult>(deps, task, 'analyst', 'analyst_report', SYSTEM_PROMPTS.analyst, aInput, known, toolCalls);
  await reportProgress(db, task.id, workerId, 'Rapport gevalideerd (schema + bewijs)');
  const art = await saveArtifact(db, { workspaceId: task.workspaceId, taskId: task.id, kind: 'analyst_report', schemaName: 'analyst_report', content: output, isDemo: ws.isDemo });
  await transitionTask(db, task.id, 'succeeded', { workerId, patch: { resultArtifactId: art.id, progressNote: 'Gereed' }, payload: { artifactId: art.id } });
  await releaseParentIfReady(db, task.id);
}

async function runMorningBrief(deps: WorkerDeps, task: TaskRow) {
  const { db, workerId } = deps;
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: task.workspaceId } });
  const deps_ = await db.taskDependency.findMany({ where: { taskId: task.id } });
  if (deps_.length === 0) {
    const input = task.input as { fromLocal?: string; toLocal?: string };
    const range = input.fromLocal && input.toLocal ? input : defaultPeriod(new Date(), ws.reportingTimezone);
    // Eerst blokkeren, dan de deeltaak maken: zo kan het vrijgeven nooit een race verliezen.
    await transitionTask(db, task.id, 'blocked', { workerId, patch: { waitReason: 'dependency', progressNote: 'Wacht op Commerce Analyst' } });
    await createTask(db, {
      workspaceId: task.workspaceId, type: 'commerce_analysis', title: `Analyse ${range.fromLocal}`, agentRole: 'analyst',
      input: range, parentTaskId: task.id, isDemo: task.isDemo, createdById: task.createdById,
    });
    return;
  }
  const child = await db.task.findUniqueOrThrow({ where: { id: deps_[0]!.dependsOnId } });
  if (child.status !== 'succeeded' || !child.resultArtifactId) throw new TaskAbort(`Deeltaak niet gereed (${child.status}).`);
  const analystArt = await db.artifact.findUniqueOrThrow({ where: { id: child.resultArtifactId } });
  const report = analystArt.content as unknown as TaskResult;
  await reportProgress(db, task.id, workerId, 'Analistenrapport ontvangen; synthese door Lead');

  const snaps = await db.metricSnapshot.findMany({ where: { taskId: child.id, workspaceId: task.workspaceId } });
  const known = emptyKnownEvidence();
  for (const s of snaps) known.metricSnapshots.set(s.id, { metricKey: s.metricKey, value: s.value });
  known.artifacts.add(analystArt.id);
  known.tasks.add(child.id);
  const inv = await db.inventorySnapshot.findMany({ where: { workspaceId: task.workspaceId }, orderBy: { capturedAt: 'desc' } });
  const latest = new Map<string, (typeof inv)[number]>();
  for (const i of inv) if (!latest.has(i.sku)) latest.set(i.sku, i);
  for (const i of latest.values()) known.sourceRecords.add(i.id);

  const lInput: LeadInput = {
    period: report.period,
    analystReport: report,
    analystArtifactId: analystArt.id,
    analystTaskId: child.id,
    metrics: snaps
      .filter((s) => !s.metricKey.includes('__baseline'))
      .map((s) => ({ snapshotId: s.id, key: s.metricKey, label: METRIC_LABELS[s.metricKey] ?? s.metricKey, status: s.status as 'ok', value: s.value, unit: s.unit as 'minor', currency: s.currency, notes: s.notes })),
    inventory: [...latest.values()].map((i) => ({ recordId: i.id, sku: i.sku, available: i.available })),
    isDemo: ws.isDemo,
  };
  const toolCalls: ToolCallRecord[] = [];
  await invokeTool('lead', 'tasks.recent', { sinceIso: new Date(Date.now() - 864e5).toISOString() }, toolImpl(db), { workspaceId: task.workspaceId, taskId: task.id }, toolCalls);
  const brief = await modelStep<MorningBrief>(deps, task, 'lead', 'morning_brief', SYSTEM_PROMPTS.lead, lInput, known, toolCalls);
  const art = await saveArtifact(db, { workspaceId: task.workspaceId, taskId: task.id, kind: 'morning_brief', schemaName: 'morning_brief', content: brief, isDemo: ws.isDemo });
  await transitionTask(db, task.id, 'succeeded', { workerId, patch: { resultArtifactId: art.id, progressNote: 'Ochtendbrief opgeslagen' }, payload: { artifactId: art.id } });
}

/** DEMO: proces leeft (heartbeat) maar maakt geen voortgang → watchdog moet 'stalled' signaleren. */
async function runDemoStall(deps: WorkerDeps, task: TaskRow) {
  const input = task.input as { durationSec?: number };
  const until = Date.now() + (input.durationSec ?? 600) * 1000;
  await reportProgress(deps.db, task.id, deps.workerId, 'DEMO: wacht op Meta-API (gesimuleerde limiet, geen voortgang)');
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, Math.min(2000, deps.heartbeatMs ?? 2000)));
    const cur = await deps.db.task.findUnique({ where: { id: task.id }, select: { status: true } });
    if (cur?.status !== 'running') return; // geannuleerd
  }
  // Een afgelopen demo is geen echte mislukking: annuleren, zodat er geen vals 'mislukt'-alarm blijft staan.
  await transitionTask(deps.db, task.id, 'cancelled', { workerId: deps.workerId, patch: { progressNote: 'DEMO: gesimuleerde stagnatie beëindigd na ingestelde duur' } });
}

/** DEMO: provider-rate-limit — normale wachttoestand, geen alarm. */
async function runDemoRateLimit(deps: WorkerDeps, task: TaskRow) {
  const input = task.input as { waitSec?: number };
  const waitMs = (input.waitSec ?? 60) * 1000;
  await deps.db.task.update({ where: { id: task.id }, data: { rateLimitUntil: new Date(Date.now() + waitMs), progressNote: 'DEMO: Klaviyo Retry-After — wacht' } });
  await emitEvent(deps.db, { workspaceId: task.workspaceId, kind: 'task.rate_limited', taskId: task.id, agentRole: task.agentRole, payload: { waitSec: waitMs / 1000 } });
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    const cur = await deps.db.task.findUnique({ where: { id: task.id }, select: { status: true } });
    if (cur?.status !== 'running') return;
  }
  await deps.db.task.update({ where: { id: task.id }, data: { rateLimitUntil: null } });
  await reportProgress(deps.db, task.id, deps.workerId, 'DEMO: rate limit voorbij');
  await transitionTask(deps.db, task.id, 'succeeded', { workerId: deps.workerId, patch: { progressNote: 'DEMO afgerond (geen resultaatartefact)' } });
}

export async function processTask(deps: WorkerDeps, taskId: string): Promise<'done' | 'not_claimed' | 'skipped'> {
  const { db, workerId } = deps;
  const pre = await db.task.findUnique({ where: { id: taskId } });
  if (!pre) return 'not_claimed';
  const ws = await db.workspace.findUnique({ where: { id: pre.workspaceId } });
  if (ws?.emergencyStop && (pre.type === 'morning_brief' || pre.type === 'commerce_analysis')) {
    deps.log('noodstop actief; taak blijft in wachtrij', { taskId });
    return 'skipped';
  }
  const task = await claimTask(db, taskId, workerId);
  if (!task) return 'not_claimed';
  deps.log(`taak gestart ${task.type}`, { taskId, attempt: task.attempts });
  const hb = setInterval(() => {
    heartbeatTask(db, taskId, workerId).catch(() => {});
  }, deps.heartbeatMs ?? 10_000);
  try {
    switch (task.type) {
      case 'cmva_sync': {
        const count = await syncCmva(db, task.workspaceId, undefined, task.isDemo);
        await transitionTask(db, task.id, 'succeeded', { workerId, patch: { progressNote: `CMVA: ${count} dagmetrics opgeslagen (EUR)` } });
        break;
      }
      case 'commerce_analysis':
        await runAnalyst(deps, task);
        break;
      case 'morning_brief':
        await runMorningBrief(deps, task);
        break;
      case 'meeting_demo': {
        const r = await startMeeting(deps, {
          workspaceId: task.workspaceId, meetingKey: `demo-${task.id}`, kind: 'demo', title: 'Demo-vergadering (direct gestart)',
          plannedAt: new Date(), late: false, isDemo: true,
        });
        await transitionTask(db, task.id, 'succeeded', { workerId, patch: { progressNote: `Vergadering gestart` }, payload: { meetingId: r.meeting.id } });
        break;
      }
      case 'demo_stall':
        await runDemoStall(deps, task);
        break;
      case 'demo_rate_limit':
        await runDemoRateLimit(deps, task);
        break;
      default:
        throw new TaskAbort(`Onbekend taaktype ${task.type}`);
    }
  } catch (e) {
    if (e instanceof TaskConflictError) {
      deps.log('taak intussen gewijzigd (bv. geannuleerd); geen verdere actie', { taskId });
    } else {
      const reason = e instanceof TaskAbort ? e.message : `Onverwachte fout: ${(e as Error).message}`;
      deps.log('taak mislukt', { taskId, reason });
      try {
        await transitionTask(db, taskId, 'failed', { workerId, patch: { failureReason: reason } });
        await releaseParentIfReady(db, taskId);
      } catch {
        /* status al gewijzigd */
      }
    }
  } finally {
    clearInterval(hb);
  }
  return 'done';
}

/** Stuurt wachtende taken naar de queue. Dubbele jobs zijn onschadelijk (voorwaardelijke claim). */
export async function dueForDispatch(db: Db, now = new Date()) {
  return db.task.findMany({
    where: {
      OR: [
        { status: 'queued', OR: [{ dispatchedAt: null }, { dispatchedAt: { lt: new Date(now.getTime() - 60_000) } }] },
        // Lease verlopen (worker gestopt midden in een taak) → opnieuw aanbieden; claim neemt over of faalt bij max pogingen.
        { status: 'running', leaseUntil: { lt: now }, OR: [{ dispatchedAt: null }, { dispatchedAt: { lt: new Date(now.getTime() - 30_000) } }] },
      ],
    },
    take: 20,
    orderBy: { queuedAt: 'asc' },
  });
}

export function todayLocal(tz: string) {
  return localDateString(new Date(), tz);
}
