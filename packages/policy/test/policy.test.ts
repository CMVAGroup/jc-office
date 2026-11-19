import { describe, expect, it } from 'vitest';
import { can, checkApproval, executeApprovedAction, ExternalWritesDisabledError, proposalHash, requirePermission } from '../src';

const bound = {
  provider: 'meta', accountRef: 'act_1', targetObject: 'adset:1', operation: 'adset.update_daily_budget',
  payload: { oldDailyBudgetMinor: 5000, newDailyBudgetMinor: 4000 }, preconditions: { current: 5000 }, expiresAt: '2026-11-20T00:00:00.000Z',
};
const proposal = { ...bound, status: 'pending_approval', payloadHash: proposalHash(bound) };
const now = new Date('2026-11-19T12:00:00Z');

describe('rollen', () => {
  it('owner/operator/viewer hebben precies hun rechten', () => {
    expect(can('owner', 'approval.decide')).toBe(true);
    expect(can('operator', 'approval.decide')).toBe(false);
    expect(can('operator', 'task.create')).toBe(true);
    expect(can('viewer', 'task.create')).toBe(false);
    expect(can('viewer', 'read')).toBe(true);
    expect(can(undefined, 'read')).toBe(false);
    expect(can('admin', 'read')).toBe(false);
    expect(() => requirePermission('viewer', 'settings.write')).toThrow(/Geen toestemming/);
  });
});

describe('approvalbinding', () => {
  it('hash is onafhankelijk van sleutelvolgorde maar verandert bij iedere payloadwijziging', () => {
    expect(proposalHash({ ...bound, payload: { newDailyBudgetMinor: 4000, oldDailyBudgetMinor: 5000 } })).toBe(proposal.payloadHash);
    expect(proposalHash({ ...bound, payload: { ...bound.payload, newDailyBudgetMinor: 4001 } })).not.toBe(proposal.payloadHash);
    expect(proposalHash({ ...bound, accountRef: 'act_2' })).not.toBe(proposal.payloadHash);
  });
  it('alleen owner, juiste status, niet verlopen, ongewijzigde payload', () => {
    const ok = { role: 'owner', proposal, presentedHash: proposal.payloadHash, now, emergencyStop: false };
    expect(checkApproval(ok)).toEqual({ ok: true });
    expect(checkApproval({ ...ok, role: 'operator' })).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(checkApproval({ ...ok, now: new Date('2026-11-21T00:00:00Z') })).toMatchObject({ reason: 'expired' });
    expect(checkApproval({ ...ok, presentedHash: 'x' })).toMatchObject({ reason: 'hash_mismatch' });
    expect(checkApproval({ ...ok, proposal: { ...proposal, payload: { newDailyBudgetMinor: 1 } } })).toMatchObject({ reason: 'hash_mismatch' });
    expect(checkApproval({ ...ok, proposal: { ...proposal, status: 'approved' } })).toMatchObject({ reason: 'wrong_status' });
  });
  it('de executor voert in fase 1 nooit iets extern uit', () => {
    expect(() => executeApprovedAction('p1')).toThrow(ExternalWritesDisabledError);
  });
});
