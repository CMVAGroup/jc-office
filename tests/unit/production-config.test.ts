import { expect, it, vi } from 'vitest';
import { databaseUrl, productionEnvironment } from '../../scripts/container-env.mjs';
import { getPrisma } from '@jc/db';
import { GET } from '../../apps/web/src/app/api/health/route';

vi.mock('@jc/db', () => ({ getPrisma: vi.fn() }));

const database = () => ({ PGUSER: 'office', PGPASSWORD: 'synthetic:@/#? password', PGDATABASE: 'jc_office' });
it('pins the database host and correctly encodes special characters in credentials', () => {
  const env = { ...database(), PGHOST: 'other-host', DATABASE_URL: 'postgresql://wrong.invalid' };
  const url = new URL(databaseUrl(env));
  expect(url.hostname).toBe('postgres');
  expect(url.port).toBe('5432');
  expect(url.pathname).toBe('/jc_office');
  expect(decodeURIComponent(url.password)).toBe(env.PGPASSWORD);
});
it('forces production and disables demo/writes even when unsafe values are supplied', () => {
  const env = productionEnvironment({ ...database(), NODE_ENV: 'development', DEMO_MODE: 'true', EXTERNAL_WRITES_ENABLED: 'true' });
  expect(env).toMatchObject({ NODE_ENV: 'production', DEMO_MODE: 'false', EXTERNAL_WRITES_ENABLED: 'false', MODEL_PROVIDER: 'mock', ALLOW_REAL_MODEL_RUNS: 'false', MODEL_DAILY_BUDGET_USD: '5' });
});
it('rejects missing credentials and default session secrets without disclosing their values', () => {
  expect(() => databaseUrl({ ...database(), PGPASSWORD: '' })).toThrow('ontbreekt');
  expect(() => databaseUrl({ ...database(), PGDATABASE: 'bad/name' })).toThrow('SQL-identifiers');
  expect(() => productionEnvironment({ ...database(), SESSION_SECRET: 'change-me-synthetic-default-at-least-32-chars' })).toThrow('SESSION_SECRET');
});
it('returns only a minimal uncached health status and hides database failures', async () => {
  const query = vi.fn().mockResolvedValue([{ value: 1 }]);
  vi.mocked(getPrisma).mockReturnValue({ $queryRaw: query } as never);
  const ok = await GET();
  expect(ok.status).toBe(200);
  expect(ok.headers.get('cache-control')).toBe('no-store');
  expect(await ok.json()).toEqual({ status: 'ok' });
  query.mockRejectedValue(new Error('synthetic internal database detail'));
  const failed = await GET();
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ status: 'unavailable' });
});
