// Teamvergaderingen als duurzame workflow. Updates komen uit opgeslagen taken/resultaten/blokkades;
// de baas maakt één begrensde synthese. Verslag en evidence worden altijd opgeslagen, ook zonder open browser.
import { ROLE_CONFIGS, runValidated, SYSTEM_PROMPTS, type MeetingInput } from '@jc/agents';
import { emitEvent, Prisma, type Db } from '@jc/db';
import { AGENT_ROLES, IMPLEMENTED_ROLES, ROLE_LABELS, type AgentRole, type MeetingSynthesis } from '@jc/domain';
import type { WorkerDeps } from './deps';

const FRESHNESS_LIMIT_H: Record<string, number> = { shopify: 2, meta: 6, klaviyo: 24, clarity: 36 };
const ROLE_SOURCES: Record<AgentRole, string[]> = {
  lead: [],
  analyst: ['shopify', 'meta'],
  growth: ['meta'],
  retention: ['klaviyo'],
  cro: ['clarity'],
  merch: ['shopify'],
};

export interface StartMeetingInput {
  workspaceId: string;
  meetingKey: string;
  kind: 'standup' | 'progress' | 'close' | 'demo';
  title: string;
  plannedAt: Date;
  late: boolean;
  isDemo: boolean;
  scheduleKey?: string | null;
}

export async function startMeeting(deps: WorkerDeps, m: StartMeetingInput) {
  const { db } = deps;
  const now = new Date();
  const prev = await db.meeting.findFirst({
    where: { workspaceId: m.workspaceId, status: { in: ['in_progress', 'completed'] } },
    orderBy: { startedAt: 'desc' },
  });
  const sinceAt = prev?.startedAt ?? new Date(now.getTime() - 24 * 3600e3);
  let meeting;
  try {
    meeting = await db.meeting.create({
      data: {
        workspaceId: m.workspaceId, meetingKey: m.meetingKey, scheduleKey: m.scheduleKey ?? null, kind: m.kind,
        title: m.title, plannedAt: m.plannedAt, late: m.late, status: 'gathering', sinceAt, isDemo: m.isDemo,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { created: false as const, meeting: await db.meeting.findUniqueOrThrow({ where: { workspaceId_meetingKey: { workspaceId: m.workspaceId, meetingKey: m.meetingKey } } }) };
    }
    throw e;
  }
  await emitEvent(db, { workspaceId: m.workspaceId, kind: 'meeting.called', meetingId: meeting.id, payload: { title: m.title, late: m.late } });

  // ---- Updates samenstellen uit opgeslagen werk (geen modelcalls per agent) ----
  const tasks = await db.task.findMany({
    where: { workspaceId: m.workspaceId, OR: [{ updatedAt: { gte: sinceAt } }, { status: { in: ['queued', 'running', 'blocked', 'awaiting_review'] } }] },
    orderBy: { updatedAt: 'desc' },
  });
  const alerts = await db.watchdogAlert.findMany({ where: { workspaceId: m.workspaceId, status: 'open' } });
  const conns = await db.connection.findMany({ where: { workspaceId: m.workspaceId } });
  const lastSync = new Map<string, Date | null>();
  for (const c of conns) {
    const s = await db.syncRun.findFirst({ where: { workspaceId: m.workspaceId, provider: c.provider, status: 'succeeded' }, orderBy: { finishedAt: 'desc' } });
    lastSync.set(c.provider, s?.finishedAt ?? null);
  }
  const knownTaskIds = new Set(tasks.map((t) => t.id));
  const updates: MeetingInput['updates'] = [];
  let order = 0;
  for (const role of AGENT_ROLES) {
    const mine = tasks.filter((t) => t.agentRole === role);
    const done = mine.filter((t) => t.status === 'succeeded').map((t) => ({ text: t.title, taskId: t.id }));
    const current = mine
      .filter((t) => ['queued', 'running', 'blocked', 'awaiting_review'].includes(t.status))
      .map((t) => ({ text: `${t.title} (${t.status}${t.progressNote ? ': ' + t.progressNote : ''})`, taskId: t.id }));
    const blockers = [
      ...mine.filter((t) => t.status === 'failed').map((t) => ({ text: `${t.title} mislukt: ${t.failureReason ?? 'onbekend'}`, taskId: t.id })),
      ...alerts.filter((a) => a.agentRole === role && !mine.some((t) => t.id === a.taskId && t.status === 'failed')).map((a) => ({ text: a.cause, taskId: a.taskId })),
    ];
    const stale = ROLE_SOURCES[role].filter((p) => {
      const s = lastSync.get(p);
      return !s || now.getTime() - s.getTime() > (FRESHNESS_LIMIT_H[p] ?? 24) * 3600e3;
    });
    const nextStep = blockers.length
      ? 'Blokkade laten beoordelen door de baas'
      : current.length
        ? 'Huidige taak afronden'
        : IMPLEMENTED_ROLES.has(role)
          ? 'Wacht op nieuwe opdracht'
          : 'Rol nog niet geactiveerd (fase 1)';
    const parts: string[] = [];
    if (!IMPLEMENTED_ROLES.has(role)) parts.push('Deze rol is in fase 1 nog niet geactiveerd; ik heb geen werk gedaan.');
    else if (!done.length && !current.length && !blockers.length) parts.push('Geen werk sinds het vorige overleg.');
    if (done.length) parts.push(`Afgerond: ${done.map((d) => d.text).join('; ')}.`);
    if (current.length) parts.push(`Bezig: ${current.map((d) => d.text).join('; ')}.`);
    if (blockers.length) parts.push(`Obstakel: ${blockers.map((d) => d.text).join('; ')}.`);
    if (stale.length) parts.push(`Let op: input ${stale.join(', ')} is verouderd of ontbreekt.`);
    const evidence = [...done, ...current, ...blockers].map((x) => ({ kind: 'task', id: x.taskId }));
    await db.meetingParticipant.create({
      data: { meetingId: meeting.id, agentRole: role, seatIndex: order, attendance: mine.some((t) => t.status === 'running') ? 'background_task' : 'present' },
    });
    await db.meetingUpdate.create({
      data: {
        meetingId: meeting.id, agentRole: role, order, done, current, blockers, nextStep,
        text: parts.join(' '), staleInput: stale.length > 0, evidence,
      },
    });
    updates.push({ role, done, current, blockers });
    order++;
  }

  // ---- Eén begrensde synthese door de baas ----
  const proposals = await db.actionProposal.findMany({ where: { workspaceId: m.workspaceId, status: 'pending_approval' } });
  const briefTask = await db.task.findFirst({ where: { workspaceId: m.workspaceId, type: 'morning_brief', status: 'succeeded' }, orderBy: { finishedAt: 'desc' } });
  const briefArt = briefTask?.resultArtifactId ? await db.artifact.findUnique({ where: { id: briefTask.resultArtifactId } }) : null;
  const input: MeetingInput = {
    meetingTitle: m.title,
    updates,
    openAlerts: alerts.map((a) => ({ taskId: a.taskId, role: a.agentRole as AgentRole, cause: a.cause })),
    pendingApprovals: proposals.map((p) => ({ proposalId: p.id, summary: `${p.operation} op ${p.targetObject} (${p.provider})` })),
    latestBrief: briefArt
      ? { artifactId: briefArt.id, priorities: ((briefArt.content as { priorities?: { title: string; ownerRole: AgentRole }[] }).priorities ?? []).map((p) => ({ title: p.title, ownerRole: p.ownerRole })) }
      : null,
    isDemo: m.isDemo,
  };
  let synthesis: MeetingSynthesis | null = null;
  let synthesisError: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 };
  try {
    const res = await deps.sem.run(() =>
      runValidated<MeetingSynthesis>(deps.adapter, { schemaName: 'meeting_synthesis', system: SYSTEM_PROMPTS.meeting, input, maxTokens: ROLE_CONFIGS.lead.tokenBudget }, null),
    );
    for (const a of res.attempts) usage = { inputTokens: usage.inputTokens + a.usage.inputTokens, outputTokens: usage.outputTokens + a.usage.outputTokens, costUsdMicros: usage.costUsdMicros + a.usage.costUsdMicros };
    if (res.ok) {
      // Alleen bewijs dat werkelijk bestaat blijft staan.
      const knownArtifacts = new Set(briefArt ? [briefArt.id] : []);
      synthesis = {
        ...res.output,
        priorities: res.output.priorities.map((p) => ({
          ...p,
          evidence: p.evidence.filter((e) => (e.kind === 'task' && knownTaskIds.has(e.id)) || (e.kind === 'artifact' && knownArtifacts.has(e.id))),
        })),
      };
    } else synthesisError = res.reason;
  } catch (e) {
    synthesisError = (e as Error).message;
  }
  if (synthesis) {
    await db.meetingAction.createMany({
      data: [
        ...synthesis.actions.map((a) => ({ meetingId: meeting.id, ownerRole: a.ownerRole, description: a.description, dueAt: a.dueAt ? new Date(a.dueAt) : null, kind: 'action' })),
        ...synthesis.ownerDecisions.map((d) => ({ meetingId: meeting.id, ownerRole: 'lead', description: `${d.question} — ${d.context}`, kind: 'owner_decision' })),
      ],
    });
  }
  const visualSec = deps.meetingVisualSec ?? 45;
  const endsAt = new Date(Date.now() + visualSec * 1000);
  const updated = await db.meeting.update({
    where: { id: meeting.id },
    data: {
      status: 'in_progress',
      synthesis: synthesis ? (synthesis as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      synthesisError,
      snapshot: {
        endsAt: endsAt.toISOString(),
        visualSec,
        sinceAt: sinceAt.toISOString(),
        taskIds: [...knownTaskIds],
        openAlertIds: alerts.map((a) => a.id),
        pendingProposalIds: proposals.map((p) => p.id),
        modelProvider: deps.adapter.name,
        usage,
      },
    },
  });
  await emitEvent(db, { workspaceId: m.workspaceId, kind: 'meeting.started', meetingId: meeting.id, payload: { endsAt: endsAt.toISOString(), title: m.title } });
  deps.log(`vergadering gestart: ${m.title}`, { meetingId: meeting.id, late: m.late });
  return { created: true as const, meeting: updated };
}

/** Rondt vergaderingen af na hun zichtbare venster (ook na herstart). */
export async function advanceMeetings(deps: WorkerDeps, now = new Date()) {
  const open = await deps.db.meeting.findMany({ where: { status: { in: ['in_progress', 'gathering'] } } });
  for (const m of open) {
    const endsAt = (m.snapshot as { endsAt?: string }).endsAt;
    const stuckGathering = m.status === 'gathering' && now.getTime() - m.startedAt.getTime() > 5 * 60e3;
    if ((endsAt && new Date(endsAt) <= now) || stuckGathering) {
      const r = await deps.db.meeting.updateMany({
        where: { id: m.id, status: m.status },
        data: { status: stuckGathering ? 'failed' : 'completed', completedAt: now, ...(stuckGathering ? { synthesisError: 'Vergadering niet afgerond (worker onderbroken tijdens samenstellen).' } : {}) },
      });
      if (r.count) await emitEvent(deps.db, { workspaceId: m.workspaceId, kind: 'meeting.completed', meetingId: m.id, payload: {} });
    }
  }
}

export function meetingTitle(kind: string, label: string, late: boolean) {
  return `${label}${late ? ' (verlaat)' : ''}`;
}

export { ROLE_LABELS };
