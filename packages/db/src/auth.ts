import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import type { Db } from './client';

export const BCRYPT_COST = 12;
const WINDOW_MS = 15 * 60_000;
// Vergelijk ook bij onbekende accounts; geen snelle e-mailenumeratie.
const dummyHash = hash(randomBytes(32).toString('hex'), BCRYPT_COST);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function validPassword(password: string): boolean {
  // bcrypt accepteert maximaal 72 bytes; nooit stilzwijgend afkappen.
  return password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 72;
}

/** Atomair en gedeeld over processen. Geen e-mail of IP-adres in de limiettabel. */
export async function consumeLoginLimit(db: Db, email: string, now = new Date()): Promise<boolean> {
  const bucket = Math.floor(now.getTime() / WINDOW_MS);
  const expiresAt = new Date((bucket + 1) * WINDOW_MS);
  await db.authRateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
  const counts = await db.$transaction(async (tx) => {
    const values: number[] = [];
    // Globale bovengrens beschermt ook tegen wisselende/onbekende accounts.
    for (const scope of ['global', 'account:' + normalizeEmail(email)]) {
      const key = createHash('sha256').update(scope + ':' + bucket).digest('hex');
      const rows = await tx.$queryRaw<{ attempts: number }[]>
        `INSERT INTO auth_rate_limits (key, attempts, expires_at) VALUES (${key}, 1, ${expiresAt})
         ON CONFLICT (key) DO UPDATE SET attempts = auth_rate_limits.attempts + 1 RETURNING attempts`;
      values.push(rows[0]!.attempts);
    }
    return values;
  });
  return counts[0]! <= 300 && counts[1]! <= 5;
}

export type LoginResult =
  | { status: 'ok'; userId: string; workspaceId: string }
  | { status: 'invalid' | 'limited' };

export async function authenticatePassword(db: Db, rawEmail: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  if (!(await consumeLoginLimit(db, email))) return { status: 'limited' };
  if (!validEmail(email) || !validPassword(password)) return { status: 'invalid' };
  const user = await db.user.findUnique({
    where: { email }, include: { memberships: { include: { workspace: true }, orderBy: { id: 'asc' } } },
  });
  const matches = await compare(password, user?.passwordHash ?? await dummyHash);
  const membership = user?.memberships.find((m) => !m.workspace.isDemo);
  if (!matches || !user?.passwordHash || user.isDemo || !membership) return { status: 'invalid' };
  return { status: 'ok', userId: user.id, workspaceId: membership.workspaceId };
}

/** Eenmalige bootstrap; geen demodata en geen bestaand account overschrijven. */
export async function provisionOwner(db: Db, input: { email: string; password: string; displayName: string; workspaceName: string }) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw new Error('Ongeldig e-mailadres.');
  if (!validPassword(input.password)) throw new Error('Wachtwoord: minimaal 12 tekens en maximaal 72 UTF-8 bytes.');
  if (!input.displayName.trim() || !input.workspaceName.trim()) throw new Error('Naam en workspacenaam zijn verplicht.');
  const passwordHash = await hash(input.password, BCRYPT_COST);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74101926)`;
    const existing = await tx.membership.findFirst({ where: { role: 'owner', user: { isDemo: false } } });
    if (existing) throw new Error('Er bestaat al een productie-owner; bootstrap is eenmalig.');
    const workspace = await tx.workspace.create({ data: { name: input.workspaceName.trim() } });
    const user = await tx.user.create({ data: { email, displayName: input.displayName.trim(), passwordHash } });
    await tx.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'owner' } });
    return { userId: user.id, workspaceId: workspace.id };
  });
}
