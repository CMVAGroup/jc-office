// Controleert dat een resultaat uitsluitend naar bestaand, opgeslagen bewijs verwijst
// en dat numerieke feiten overeenkomen met de metricsnapshot waar ze naar verwijzen.
import type { EvidenceRefT, TaskResult } from './schemas';

export interface KnownEvidence {
  metricSnapshots: Map<string, { metricKey: string; value: number | null }>;
  tasks: Set<string>;
  artifacts: Set<string>;
  sourceRecords: Set<string>;
}

export function emptyKnownEvidence(): KnownEvidence {
  return { metricSnapshots: new Map(), tasks: new Set(), artifacts: new Set(), sourceRecords: new Set() };
}

function refExists(ref: EvidenceRefT, k: KnownEvidence): boolean {
  switch (ref.kind) {
    case 'metric_snapshot':
      return k.metricSnapshots.has(ref.id);
    case 'task':
      return k.tasks.has(ref.id);
    case 'artifact':
      return k.artifacts.has(ref.id);
    case 'source_record':
      return k.sourceRecords.has(ref.id);
  }
}

export function validateEvidence(
  result: TaskResult & { priorities?: { title: string; evidence: EvidenceRefT[] }[] },
  known: KnownEvidence,
): string[] {
  const errors: string[] = [];
  const check = (where: string, refs: EvidenceRefT[]) => {
    for (const r of refs) if (!refExists(r, known)) errors.push(`${where}: onbekend bewijs ${r.kind}:${r.id}`);
  };
  result.facts.forEach((f, i) => {
    check(`facts[${i}]`, f.evidence);
    if (typeof f.value === 'number') {
      const snap = f.evidence
        .filter((e) => e.kind === 'metric_snapshot')
        .map((e) => known.metricSnapshots.get(e.id))
        .find(Boolean);
      if (!snap) errors.push(`facts[${i}]: numerieke bewering zonder metricsnapshot`);
      else if (snap.value !== f.value)
        errors.push(`facts[${i}]: waarde ${f.value} wijkt af van snapshot (${snap.value})`);
    }
  });
  result.hypotheses.forEach((h, i) => check(`hypotheses[${i}]`, h.evidence));
  check('sourceRecords', result.sourceRecords);
  result.priorities?.forEach((p, i) => check(`priorities[${i}]`, p.evidence));
  return errors;
}
