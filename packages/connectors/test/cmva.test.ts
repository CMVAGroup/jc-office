import { describe, expect, it, vi } from 'vitest';
import { CmvaClient, cmvaConfig, cmvaDate, cmvaMinor, CmvaSummarySchema, normalizeCmva } from '../src';
import { cmvaFixture } from './fixtures/cmva-summary';

const config = { base: 'https://cmva.invalid', profile: 'test-shop', token: 'synthetic-test-credential' };
const mockClient = (body: unknown = cmvaFixture, status = 200, headers = {}) => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status, headers }));
  return { client: new CmvaClient(config, request), request };
};

describe('CMVA read contract', () => {
  it('validates real endpoint shape including optional document fields, null ROAS and additive fields', async () => {
    const { client, request } = mockClient();
    const data = await client.summary(120);
    expect(data.stores[0]!.products).toHaveLength(2);
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe('https://cmva.invalid/api/public/ai/summary?store=test-shop&days=120');
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });
    expect((await client.probe()).state).toBe('connected');
  });

  it.each([401, 403])('classifies auth %s and never reports connected', async (status) => {
    const { client } = mockClient({ error: 'unauthorized' }, status);
    await expect(client.summary()).rejects.toMatchObject({ kind: 'auth' });
    expect(await client.probe()).toMatchObject({ ok: false, state: 'action_required' });
  });

  it('classifies throttling with Retry-After and provider outages', async () => {
    await expect(mockClient({}, 429, { 'retry-after': '120' }).client.summary()).rejects.toMatchObject({
      kind: 'rate_limit',
      retryAfterSec: 120,
    });
    await expect(mockClient({}, 500).client.summary()).rejects.toMatchObject({ kind: 'provider_outage' });
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(config.token));
    await expect(new CmvaClient(config, request).summary()).rejects.toThrow('CMVA is niet bereikbaar');
    expect((await mockClient({}, 429).client.probe()).state).toBe('limited');
  });

  it('rejects schema changes, missing profiles, invalid JSON without exposing provider text', async () => {
    const changed = structuredClone(cmvaFixture) as any;
    changed.stores[0].per_day[0].revenue_eur = '100.29';
    await expect(mockClient(changed).client.summary()).rejects.toMatchObject({ kind: 'schema_change' });
    await expect(mockClient({ ...cmvaFixture, stores: [] }).client.summary()).rejects.toMatchObject({
      kind: 'schema_change',
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('invalid ' + config.token));
    await expect(new CmvaClient(config, request).summary()).rejects.toMatchObject({ kind: 'schema_change' });
  });

  it('makes no request with missing token/profile or invalid days', async () => {
    const { request } = mockClient();
    await expect(new CmvaClient({ ...config, token: '' }, request).summary()).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(() => cmvaConfig({ CMVA_API_BASE: config.base })).toThrow();
    await expect(new CmvaClient(config, request).summary(121)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('normalizes exact cents, negative profit, count and null ratio separately', () => {
    expect(cmvaMinor(100.29)).toBe(10029n);
    expect(cmvaMinor(-1.01)).toBe(-101n);
    expect(() => cmvaMinor(1.005)).toThrow();
    const rows = normalizeCmva(CmvaSummarySchema.parse(cmvaFixture), config.profile);
    expect(rows.find((r) => r.metric === 'revenue_eur')!.valueMinor).toBe(10029n);
    expect(rows.find((r) => r.metric === 'orders')).toMatchObject({ valueMinor: 2n, unit: 'count' });
    expect(rows.find((r) => r.metric === 'roas' && r.dateLocal === '2027-01-01')).toMatchObject({
      valueMinor: null,
      unit: 'ratio_hundredths',
    });
    expect(rows.every((r) => r.sourceCurrency === 'EUR')).toBe(true);
  });

  it('resolves year boundaries in Sydney, validates dates and rejects ambiguous duplicates', () => {
    expect(cmvaDate('31-12', '2027-01-01T00:15:00Z')).toBe('2026-12-31');
    expect(cmvaDate('01-01', '2026-12-31T14:00:00Z')).toBe('2027-01-01');
    expect(cmvaDate('31-12', '2026-12-31T12:00:00Z')).toBe('2026-12-31');
    expect(cmvaDate('29-02', '2025-01-01T00:00:00Z')).toBe('2024-02-29');
    expect(() => cmvaDate('31-02', cmvaFixture.generated_at)).toThrow();
    const copy = structuredClone(cmvaFixture);
    copy.stores[0]!.per_day.push(copy.stores[0]!.per_day[0]!);
    expect(() => normalizeCmva(CmvaSummarySchema.parse(copy), config.profile)).toThrow('dubbele');
  });
});
