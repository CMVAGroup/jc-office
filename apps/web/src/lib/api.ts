import { NextResponse } from 'next/server';
import { can, type Permission } from '@jc/policy';
import { getSession, type SessionCtx } from './session';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Alle mutaties en lees-API's: login + rolcontrole; handler krijgt de workspace-gescopete sessie. */
export async function withAuth(perm: Permission, fn: (s: SessionCtx) => Promise<Response>): Promise<Response> {
  const s = await getSession();
  if (!s) return json({ error: 'Niet ingelogd' }, 401);
  if (!can(s.role, perm)) return json({ error: `Geen toestemming (${perm}) voor rol ${s.role}` }, 403);
  try {
    return await fn(s);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}
