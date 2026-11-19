import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { authenticatePassword, provisionOwner, consumeLoginLimit } from '@jc/db';
import { compare } from '../../packages/db/node_modules/bcryptjs/index.js';
import { POST } from '../../apps/web/src/app/api/auth/login/route';
import { demoLoginAllowed, signSession, verifySession } from '../../apps/web/src/lib/session';
import { resetAndSeed, testDb } from './helpers';

const db = testDb();
const password = 'synthetic-only-password-2026';
const input = { email: 'owner@example.invalid', password, displayName: 'Test owner', workspaceName: 'Test kantoor' };
beforeEach(async () => {
  await resetAndSeed(db);
  vi.stubEnv('SESSION_SECRET', 'synthetic-test-session-secret-at-least-32-characters');
  vi.stubEnv('APP_URL', 'https://office.example.invalid');
});
afterAll(async () => { vi.unstubAllEnvs(); await db.$disconnect(); });

it('bootstraps exactly one real owner with a bcrypt hash and no fixtures in its workspace', async () => {
  const created = await provisionOwner(db, { ...input, email: ' OWNER@example.invalid ' });
  const user = await db.user.findUniqueOrThrow({ where: { id: created.userId } });
  expect(user.email).toBe(input.email);
  expect(user.isDemo).toBe(false);
  expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  expect(await compare(password, user.passwordHash!)).toBe(true);
  expect(await db.membership.findUniqueOrThrow({ where: { workspaceId_userId: created } })).toMatchObject({ role: 'owner' });
  expect(await db.workspace.findUniqueOrThrow({ where: { id: created.workspaceId } })).toMatchObject({ isDemo: false });
  await expect(provisionOwner(db, { ...input, email: 'other@example.invalid' })).rejects.toThrow('eenmalig');
  expect(await db.workspace.count({ where: { isDemo: false } })).toBe(1);
});

it('authenticates the real owner, rejects wrong/unknown/demo credentials and invalid bcrypt lengths', async () => {
  const created = await provisionOwner(db, input);
  expect(await authenticatePassword(db, ' OWNER@example.invalid ', password)).toEqual({ status: 'ok', ...created });
  expect(await authenticatePassword(db, input.email, 'wrong-password-2026')).toEqual({ status: 'invalid' });
  expect(await authenticatePassword(db, 'missing@example.invalid', password)).toEqual({ status: 'invalid' });
  await db.user.update({ where: { id: created.userId }, data: { isDemo: true } });
  expect(await authenticatePassword(db, input.email, password)).toEqual({ status: 'invalid' });
  await expect(provisionOwner(db, { ...input, password: 'é'.repeat(37) })).rejects.toThrow('72');
});

it('limits concurrent attempts across clients, normalizes account keys and expires old windows', async () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const allowed = await Promise.all(Array.from({ length: 8 }, (_, i) => consumeLoginLimit(db, i % 2 ? 'OWNER@example.invalid' : ' owner@example.invalid ', now)));
  expect(allowed.filter(Boolean)).toHaveLength(5);
  expect(await consumeLoginLimit(db, input.email, new Date(now.getTime() + 15 * 60_000))).toBe(true);
  expect(await db.authRateLimit.count()).toBe(2);
});

it('applies a global limit even when account names change', async () => {
  const now = new Date('2026-11-19T12:00:00Z');
  await consumeLoginLimit(db, input.email, now);
  await db.authRateLimit.updateMany({ data: { attempts: 300 } });
  expect(await consumeLoginLimit(db, 'another@example.invalid', now)).toBe(false);
});

const request = (email: string, secret: string, origin = 'https://office.example.invalid') => new Request('https://office.example.invalid/api/auth/login', {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email, password: secret }),
});
it('issues a secure HttpOnly session only after successful login; errors do not disclose the account', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DEMO_MODE', 'true');
  const created = await provisionOwner(db, input);
  expect(demoLoginAllowed()).toBe(false);
  const response = await POST(request(input.email, password));
  expect(response.status).toBe(303);
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=strict');
  const token = cookie.split(';')[0]!.slice('jc_session='.length);
  expect(verifySession(token)).toEqual(created);
  expect(verifySession(token + '.extra')).toBeNull();
  expect(verifySession(token + 'x')).toBeNull();
  const bad = await POST(request(input.email, 'wrong-password-2026'));
  const unknown = await POST(request('unknown@example.invalid', password));
  expect(bad.headers.get('location')).toBe(unknown.headers.get('location'));
  expect(bad.headers.get('set-cookie')).toBeNull();
});

it('rejects cross-origin and oversized forms, requires production APP_URL and returns HTTP 429', async () => {
  expect((await POST(request(input.email, password, 'https://attacker.invalid'))).status).toBe(403);
  expect((await POST(request(input.email, 'x'.repeat(9000)))).status).toBe(400);
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_URL', '');
  expect((await POST(request(input.email, password))).status).toBe(403);
  vi.stubEnv('APP_URL', 'https://office.example.invalid');
  for (let i = 0; i < 5; i++) await POST(request(input.email, password));
  const limited = await POST(request(input.email, password));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('900');
});
