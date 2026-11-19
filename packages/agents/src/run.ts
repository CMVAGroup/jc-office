// Gestructureerde run met schema-validatie, bewijscontrole en hoogstens één gerichte herstelpoging.
import { formatZodError, SCHEMAS, validateEvidence, type KnownEvidence, type SchemaName, type TaskResult } from '@jc/domain';
import type { GenerateRequest, GenerateResult, ModelAdapter } from './adapter';

export interface ValidatedRun<T> {
  ok: true;
  output: T;
  attempts: GenerateResult[];
  repairAttempted: boolean;
}
export interface FailedRun {
  ok: false;
  reason: string;
  attempts: GenerateResult[];
  repairAttempted: boolean;
}

export async function runValidated<T>(
  adapter: ModelAdapter,
  req: Omit<GenerateRequest, 'repairHint'>,
  known: KnownEvidence | null,
): Promise<ValidatedRun<T> | FailedRun> {
  const attempts: GenerateResult[] = [];
  let hint: string | undefined;
  for (let i = 0; i < 2; i++) {
    const res = await adapter.generate({ ...req, repairHint: hint });
    attempts.push(res);
    const parsed = SCHEMAS[req.schemaName].safeParse(res.output);
    if (!parsed.success) {
      hint = formatZodError(parsed.error);
      continue;
    }
    if (known && req.schemaName !== 'meeting_synthesis') {
      const errs = validateEvidence(parsed.data as TaskResult, known);
      if (errs.length) {
        hint = errs.join('; ');
        continue;
      }
    }
    return { ok: true, output: parsed.data as T, attempts, repairAttempted: i > 0 };
  }
  return { ok: false, reason: `Uitvoer ongeldig na één herstelpoging: ${hint}`, attempts, repairAttempted: true };
}
