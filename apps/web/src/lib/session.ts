// Ondertekende sessiecookie (HMAC-SHA256). Rol en workspace worden bij elk verzoek opnieuw uit de database gelezen.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getPrisma } from '@jc/db';
import type { UserRole } from '@jc/domain';

export const SESSION_COOKIE = 'jc_session';
const MAX_AGE_SEC = 8 * 3600;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ontbreekt of is te kort (min. 32 tekens).');
  if (process.env.NODE_ENV === 'production' && s.startsWith('change-me')) throw new Error('Standaard SESSION_SECRET is niet toegestaan in productie.');
  return s;
}

export function signSession(payload: { userId: string; workspaceId: string }): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): { userId: string; workspaceId: string } | null {
  if (!token) return null;
  const [body, sig, extra] = token.split('.');
  if (extra !== undefined) return null;
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { userId: string; workspaceId: string; exp: number };
    if (typeof p.exp !== 'number' || !Number.isFinite(p.exp) || p.exp <= Date.now() / 1000 || typeof p.userId !== 'string' || typeof p.workspaceId !== 'string') return null;
    return { userId: p.userId, workspaceId: p.workspaceId };
  } catch {
    return null;
  }
}

export function demoLoginAllowed(): boolean {
  return process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

export interface SessionCtx {
  userId: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  role: UserRole;
  isDemo: boolean;
}

/** Leest en valideert de sessie; controleert lidmaatschap van de workspace in de database. */
export async function getSession(): Promise<SessionCtx | null> {
  const jar = await cookies();
  const s = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const db = getPrisma();
  const m = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.userId } },
    include: { user: true, workspace: true },
  });
  if (!m) return null;
  // Demogebruikers kunnen alleen in demomodus inloggen.
  if (m.user.isDemo && !demoLoginAllowed()) return null;
  return {
    userId: m.userId,
    displayName: m.user.displayName,
    workspaceId: m.workspaceId,
    workspaceName: m.workspace.name,
    role: m.role as UserRole,
    isDemo: m.workspace.isDemo,
  };
}
