// Deterministische mockadapter: bouwt schema-geldige uitvoer uitsluitend uit de aangeleverde data.
// Bedoeld voor de demo en tests. Iedere uitvoer is gelabeld als demo/mock.
import { formatMinor, ROLE_LABELS, type AgentRole, type MeetingSynthesis, type MorningBrief, type SchemaName, type TaskResult } from '@jc/domain';

export interface MetricView {
  snapshotId: string;
  key: string;
  label: string;
  status: 'ok' | 'partial' | 'unknown';
  value: number | null;
  unit: 'minor' | 'ratio' | 'count';
  currency: string | null;
  notes: string[];
}

export interface AnalystInput {
  period: { from: string; to: string; timezone: string };
  metrics: MetricView[];
  baseline: { key: string; snapshotId: string; value: number | null; days: number }[];
  freshness: TaskResult['freshness'];
  inventory: { recordId: string; sku: string; available: number }[];
  isDemo: boolean;
}

export interface LeadInput {
  period: AnalystInput['period'];
  analystReport: TaskResult;
  analystArtifactId: string;
  analystTaskId: string;
  metrics: MetricView[];
  inventory: AnalystInput['inventory'];
  isDemo: boolean;
}

export interface MeetingInput {
  meetingTitle: string;
  updates: {
    role: AgentRole;
    done: { text: string; taskId: string }[];
    current: { text: string; taskId: string }[];
    blockers: { text: string; taskId: string }[];
  }[];
  openAlerts: { taskId: string; role: AgentRole; cause: string }[];
  pendingApprovals: { proposalId: string; summary: string }[];
  latestBrief: { artifactId: string; priorities: { title: string; ownerRole: AgentRole }[] } | null;
  isDemo: boolean;
}

function fmt(m: MetricView): string {
  if (m.value === null) return 'onbekend';
  if (m.unit === 'minor') return formatMinor(m.value, m.currency);
  if (m.unit === 'ratio') return m.value.toFixed(2).replace('.', ',');
  return String(m.value);
}

function mockAnalyst(input: AnalystInput): TaskResult {
  const facts: TaskResult['facts'] = [];
  const hypotheses: TaskResult['hypotheses'] = [];
  const recommendations: string[] = [];
  const missingData: string[] = [];
  for (const m of input.metrics) {
    if (m.value === null || m.status === 'unknown') {
      missingData.push(`${m.label}: ${m.notes[0] ?? 'onbekend'}`);
      continue;
    }
    facts.push({
      statement: `${m.label} ${input.period.from === input.period.to ? 'op ' + input.period.from : input.period.from + ' t/m ' + input.period.to}: ${fmt(m)}${m.status === 'partial' ? ' (gedeeltelijk)' : ''}.`,
      metricKey: m.key,
      value: m.value,
      evidence: [{ kind: 'metric_snapshot', id: m.snapshotId, label: m.label }],
    });
    const base = input.baseline.find((b) => b.key === m.key);
    if (base && base.value && m.value !== null && m.unit !== 'count') {
      const delta = (m.value - base.value) / Math.abs(base.value);
      if (Math.abs(delta) >= 0.15) {
        hypotheses.push({
          statement: `${m.label} ligt ${Math.abs(Math.round(delta * 100))}% ${delta > 0 ? 'hoger' : 'lager'} dan de basislijn van de ${base.days} dagen ervoor. Oorzaak niet vastgesteld.`,
          evidence: [
            { kind: 'metric_snapshot', id: m.snapshotId, label: `${m.label} (periode)` },
            { kind: 'metric_snapshot', id: base.snapshotId, label: `${m.label} (basislijn)` },
          ],
          confidence: 'laag',
        });
      }
    }
  }
  const out = input.inventory.filter((i) => i.available === 0);
  const low = input.inventory.filter((i) => i.available > 0 && i.available < 10);
  if (out.length) recommendations.push(`Controleer voorraad: ${out.map((i) => i.sku).join(', ')} op 0 stuks.`);
  if (low.length) recommendations.push(`Lage voorraad (<10): ${low.map((i) => `${i.sku} (${i.available})`).join(', ')}.`);
  return {
    summary: `Analyse ${input.period.from}${input.period.to !== input.period.from ? ' t/m ' + input.period.to : ''}: ${facts.length} gecontroleerde cijfers, ${hypotheses.length} afwijking(en), ${missingData.length} onbekende metric(s).`,
    facts,
    hypotheses,
    recommendations,
    sourceRecords: input.metrics.map((m) => ({ kind: 'metric_snapshot' as const, id: m.snapshotId, label: m.label })),
    period: input.period,
    freshness: input.freshness,
    assumptions: ['Winkelvaluta EUR is een demo-aanname; bij onboarding bevestigen.', 'Rapportagedag volgens Europe/Amsterdam.'],
    limitations: [
      'Mockmodel: tekst is deterministisch samengesteld, geen taalmodel gebruikt.',
      ...(input.isDemo ? ['Alle brondata is demofixture, geen echte winkeldata.'] : []),
    ],
    missingData,
    artifacts: [],
    proposedAction: null,
    isDemo: input.isDemo,
  };
}

function mockLead(input: LeadInput): MorningBrief {
  const byKey = new Map(input.metrics.map((m) => [m.key, m]));
  const priorities: MorningBrief['priorities'] = [];
  const devs = input.analystReport.hypotheses;
  const rps = byKey.get('revenue_per_meta_spend');
  if (devs.length && rps) {
    priorities.push({
      title: 'Afwijking omzet/advertentiekosten onderzoeken',
      rationale: `${devs[0]!.statement} Omzet/Meta-spend: ${fmt(rps)}. Eerst bron en attributie controleren; geen budgetwijziging zonder goedkeuring.`,
      ownerRole: 'growth',
      evidence: [...devs[0]!.evidence, { kind: 'metric_snapshot', id: rps.snapshotId, label: rps.label }],
    });
  }
  const out = input.inventory.filter((i) => i.available === 0);
  if (out.length) {
    priorities.push({
      title: `Voorraad op nul: ${out.map((i) => i.sku).join(', ')}`,
      rationale: 'Verkoopbare voorraad is 0; controleer of advertenties of mails naar deze SKU’s verwijzen.',
      ownerRole: 'merch',
      evidence: out.map((i) => ({ kind: 'source_record' as const, id: i.recordId, label: `Voorraadsnapshot ${i.sku}` })),
    });
  }
  const margin = byKey.get('contribution_margin_after_ads');
  if (margin && margin.status === 'unknown') {
    priorities.push({
      title: 'Kostprijzen aanleveren zodat marge berekend kan worden',
      rationale: margin.notes.join(' '),
      ownerRole: 'lead',
      evidence: [{ kind: 'metric_snapshot', id: margin.snapshotId, label: margin.label }],
    });
  }
  return {
    ...input.analystReport,
    summary: `Ochtendbrief ${input.period.from}: ${priorities.length} prioriteit(en). ${input.analystReport.summary}`,
    sourceRecords: [
      ...input.analystReport.sourceRecords,
      { kind: 'artifact', id: input.analystArtifactId, label: 'Analistenrapport' },
      { kind: 'task', id: input.analystTaskId, label: 'Analysetaak' },
    ],
    priorities: priorities.slice(0, 3),
  };
}

function mockMeeting(input: MeetingInput): MeetingSynthesis {
  const priorities: MeetingSynthesis['priorities'] = [];
  for (const a of input.openAlerts) {
    if (priorities.length >= 3) break;
    priorities.push({ title: `Vastgelopen werk oplossen bij ${ROLE_LABELS[a.role]}: ${a.cause}`, ownerRole: a.role, deadline: null, evidence: [{ kind: 'task', id: a.taskId }] });
  }
  for (const u of input.updates) {
    for (const b of u.blockers) {
      if (priorities.length >= 3) break;
      if (priorities.some((p) => p.evidence.some((e) => e.id === b.taskId))) continue;
      priorities.push({ title: `Blokkade: ${b.text}`, ownerRole: u.role, deadline: null, evidence: [{ kind: 'task', id: b.taskId }] });
    }
  }
  if (input.latestBrief) {
    for (const p of input.latestBrief.priorities) {
      if (priorities.length >= 3) break;
      priorities.push({ title: p.title, ownerRole: p.ownerRole, deadline: null, evidence: [{ kind: 'artifact', id: input.latestBrief.artifactId, label: 'Ochtendbrief' }] });
    }
  }
  const actions: MeetingSynthesis['actions'] = priorities.map((p) => ({ ownerRole: p.ownerRole, description: p.title, dueAt: null }));
  const working = input.updates.filter((u) => u.done.length || u.current.length).length;
  return {
    summary: `${input.meetingTitle}: ${working} van ${input.updates.length} agents hadden werk sinds het vorige overleg; ${input.openAlerts.length} open waarschuwing(en); ${input.pendingApprovals.length} voorstel(len) wachten op de eigenaar.${input.isDemo ? ' (demo/mock)' : ''}`,
    priorities,
    actions,
    ownerDecisions: input.pendingApprovals.map((p) => ({ question: `Beoordeel voorstel: ${p.summary}`, context: `Voorstel ${p.proposalId}; goedkeuring voert in fase 1 niets extern uit.` })),
    externalWritesAuthorized: false,
    isDemo: input.isDemo,
  };
}

export function mockGenerate(schemaName: SchemaName, input: unknown): unknown {
  switch (schemaName) {
    case 'analyst_report':
      return mockAnalyst(input as AnalystInput);
    case 'morning_brief':
      return mockLead(input as LeadInput);
    case 'meeting_synthesis':
      return mockMeeting(input as MeetingInput);
  }
}
