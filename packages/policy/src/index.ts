// Rechten, approval-binding en de (in fase 1 hard uitgeschakelde) executorpoort.
import { createHash } from 'node:crypto';
import type { UserRole } from '@jc/domain';

// ---------- Rechten per concrete operatie ----------
export type Permission =
  | 'read'
  | 'task.create'
  | 'task.cancel'
  | 'task.retry'
  | 'proposal.create'
  | 'approval.decide'
  | 'meeting.start_demo'
  | 'demo.simulate'
  | 'settings.write'
  | 'emergency_stop';

const MATRIX: Record<UserRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'read',
    'task.create',
    'task.cancel',
    'task.retry',
    'proposal.create',
    'approval.decide',
    'meeting.start_demo',
    'demo.simulate',
    'settings.write',
    'emergency_stop',
  ]),
  operator: new Set<Permission>([
    'read',
    'task.create',
    'task.cancel',
    'task.retry',
    'proposal.create',
    'meeting.start_demo',
    'demo.simulate',
  ]),
  viewer: new Set<Permission>(['read']),
};

export function can(role: UserRole | string | null | undefined, perm: Permission): boolean {
  if (!role || !(role in MATRIX)) return false;
  return MATRIX[role as UserRole].has(perm);
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(perm: string) {
    super(`Geen toestemming voor ${perm}`);
  }
}

export function requirePermission(role: string | null | undefined, perm: Permission): void {
  if (!can(role, perm)) throw new ForbiddenError(perm);
}

// ---------- Payloadbinding ----------
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export interface BoundProposal {
  provider: string;
  accountRef: string;
  targetObject: string;
  operation: string;
  payload: unknown;
  preconditions: unknown;
  expiresAt: string; // ISO
}

/** Hash bindt account, doelobject, operatie, payload, preconditions en vervaltijd. */
export function proposalHash(p: BoundProposal): string {
  return createHash('sha256').update(canonicalJson(p)).digest('hex');
}

export type ApprovalCheck =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'hash_mismatch' | 'wrong_status' | 'forbidden' | 'emergency_stop'; message: string };

export function checkApproval(input: {
  role: string;
  proposal: BoundProposal & { status: string; payloadHash: string };
  presentedHash: string;
  now: Date;
  emergencyStop: boolean;
}): ApprovalCheck {
  if (!can(input.role, 'approval.decide'))
    return { ok: false, reason: 'forbidden', message: 'Alleen de owner kan goedkeuren.' };
  if (input.proposal.status !== 'pending_approval')
    return { ok: false, reason: 'wrong_status', message: `Voorstel heeft status ${input.proposal.status}.` };
  if (new Date(input.proposal.expiresAt) <= input.now)
    return { ok: false, reason: 'expired', message: 'Voorstel is verlopen.' };
  const p = input.proposal;
  const actual = proposalHash({
    provider: p.provider,
    accountRef: p.accountRef,
    targetObject: p.targetObject,
    operation: p.operation,
    payload: p.payload,
    preconditions: p.preconditions,
    expiresAt: new Date(p.expiresAt).toISOString(),
  });
  if (actual !== input.proposal.payloadHash || input.presentedHash !== actual)
    return {
      ok: false,
      reason: 'hash_mismatch',
      message: 'Payload is gewijzigd sinds het voorstel; approval ongeldig. Maak een nieuw voorstel.',
    };
  return { ok: true };
}

// ---------- Executor ----------
export const EXTERNAL_WRITES_PHASE1_DISABLED = true as const;

export class ExternalWritesDisabledError extends Error {
  constructor() {
    super('Externe schrijfacties zijn in fase 1 hard uitgeschakeld. Er is niets extern uitgevoerd.');
  }
}

/**
 * Enige toegangspoort naar externe writes. In fase 1 gooit hij altijd, ongeacht configuratie.
 * De echte executor (fase 6) krijgt eigen writercredentials en hercontroleert rechten, freshness en externe toestand.
 */
export function executeApprovedAction(_proposalId: string): never {
  throw new ExternalWritesDisabledError();
}

// ---------- Agent tool registry: operatieclassificatie ----------
export type OperationClass = 'read' | 'local_write' | 'external_write';
