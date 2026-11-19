// Demoseed: workspace, demogebruikers, fixturedata (overal is_demo), connecties 'demo/niet gekoppeld',
// schema's voor vergaderingen en ochtendbrief, kennisdocumenten en één demo-actievoorstel.
import { buildFixtures, FIXTURE_SOURCE_VERSION } from '@jc/connectors';
import { DEFAULT_MEETING_SCHEDULES, localDateString } from '@jc/domain';
import { proposalHash } from '@jc/policy';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './client';
import { Prisma } from './client';

export const DEMO_WORKSPACE_ID = 'ws_demo';
export const OTHER_WORKSPACE_ID = 'ws_other_test';
export const DEMO_USERS = [
  { id: 'usr_demo_owner', email: 'eigenaar@demo.local', displayName: 'Demo-eigenaar', role: 'owner' },
  { id: 'usr_demo_operator', email: 'operator@demo.local', displayName: 'Demo-operator', role: 'operator' },
  { id: 'usr_demo_viewer', email: 'kijker@demo.local', displayName: 'Demo-kijker', role: 'viewer' },
] as const;
export const OTHER_USER = { id: 'usr_other_owner', email: 'eigenaar@andere.local', displayName: 'Eigenaar andere workspace' };

function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  return { meta, body: m[2] ?? '' };
}

export async function seedDemo(db: Db, opts: { now?: Date; knowledgeDir?: string; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const tz = 'Europe/Amsterdam';
  const existing = await db.workspace.findUnique({ where: { id: DEMO_WORKSPACE_ID } });
  if (existing && !opts.force) return { workspaceId: DEMO_WORKSPACE_ID, created: false };

  await db.workspace.upsert({
    where: { id: DEMO_WORKSPACE_ID },
    create: { id: DEMO_WORKSPACE_ID, name: 'Julie & Claire (demo-workspace)', reportingTimezone: tz, shopCurrency: 'EUR', currencyConfirmed: false, isDemo: true },
    update: {},
  });
  await db.workspace.upsert({
    where: { id: OTHER_WORKSPACE_ID },
    create: { id: OTHER_WORKSPACE_ID, name: 'Andere workspace (autorisatietest)', reportingTimezone: tz, isDemo: true },
    update: {},
  });
  for (const u of DEMO_USERS) {
    await db.user.upsert({ where: { id: u.id }, create: { id: u.id, email: u.email, displayName: u.displayName, isDemo: true }, update: {} });
    await db.membership.upsert({
      where: { workspaceId_userId: { workspaceId: DEMO_WORKSPACE_ID, userId: u.id } },
      create: { workspaceId: DEMO_WORKSPACE_ID, userId: u.id, role: u.role },
      update: { role: u.role },
    });
  }
  await db.user.upsert({ where: { id: OTHER_USER.id }, create: { ...OTHER_USER, isDemo: true }, update: {} });
  await db.membership.upsert({
    where: { workspaceId_userId: { workspaceId: OTHER_WORKSPACE_ID, userId: OTHER_USER.id } },
    create: { workspaceId: OTHER_WORKSPACE_ID, userId: OTHER_USER.id, role: 'owner' },
    update: {},
  });

  for (const provider of ['shopify', 'meta', 'klaviyo', 'clarity']) {
    await db.connection.upsert({
      where: { workspaceId_provider: { workspaceId: DEMO_WORKSPACE_ID, provider } },
      create: { workspaceId: DEMO_WORKSPACE_ID, provider, status: 'demo_not_connected', isDemo: true, accountTimezone: provider === 'meta' ? tz : null, currency: provider === 'meta' ? 'EUR' : null },
      update: { status: 'demo_not_connected' },
    });
  }

  // ---- Fixtures ----
  const ws = DEMO_WORKSPACE_ID;
  const f = buildFixtures(localDateString(now, tz), tz, now);
  for (const p of f.products) {
    const prod = await db.product.upsert({
      where: { workspaceId_provider_externalId: { workspaceId: ws, provider: 'shopify', externalId: p.externalId } },
      create: { workspaceId: ws, externalId: p.externalId, title: p.title, status: p.status, isDemo: true },
      update: {},
    });
    for (const v of p.variants) {
      await db.variant.upsert({
        where: { workspaceId_externalId: { workspaceId: ws, externalId: v.externalId } },
        create: { workspaceId: ws, productId: prod.id, ...v, isDemo: true },
        update: {},
      });
    }
  }
  await db.inventorySnapshot.createMany({ data: f.inventory.map((i) => ({ workspaceId: ws, ...i, isDemo: true })) });
  const orderIdByExt = new Map<string, string>();
  for (const o of f.orders) {
    const order = await db.order.upsert({
      where: { workspaceId_provider_externalId: { workspaceId: ws, provider: 'shopify', externalId: o.externalId } },
      create: {
        workspaceId: ws, externalId: o.externalId, name: o.name, createdAtSource: o.createdAt, cancelledAt: o.cancelledAt,
        isTest: o.isTest, currency: o.currency, shippingExVatMinor: o.shippingExVatMinor, taxMinor: o.taxMinor,
        sourceVersion: FIXTURE_SOURCE_VERSION, isDemo: true,
        lines: { create: o.lines.map((l) => ({ workspaceId: ws, ...l, isDemo: true })) },
      },
      update: {},
    });
    orderIdByExt.set(o.externalId, order.id);
  }
  for (const r of f.refunds) {
    const orderId = orderIdByExt.get(r.orderExternalId);
    if (!orderId) continue;
    await db.refundLine.upsert({
      where: { workspaceId_externalId: { workspaceId: ws, externalId: r.externalId } },
      create: { workspaceId: ws, orderId, externalId: r.externalId, sku: r.sku, quantity: r.quantity, amountExVatMinor: r.amountExVatMinor, refundedAt: r.refundedAt, isDemo: true },
      update: {},
    });
  }
  await db.costEntry.createMany({ data: f.costs.map((c) => ({ workspaceId: ws, ...c, isDemo: true })) });
  await db.adInsight.createMany({ data: f.adInsights.map((a) => ({ workspaceId: ws, ...a, isDemo: true })), skipDuplicates: true });
  await db.klaviyoReport.createMany({ data: f.klaviyo.map((k) => ({ workspaceId: ws, ...k, isDemo: true })) });
  await db.claritySnapshot.createMany({
    data: f.clarity.map((c) => ({ workspaceId: ws, ...c, rows: c.rows as Prisma.InputJsonValue, isDemo: true })),
  });
  for (const provider of ['shopify', 'meta', 'klaviyo', 'clarity']) {
    await db.syncRun.create({
      data: { workspaceId: ws, provider, kind: 'fixture_import', status: 'succeeded', finishedAt: now, sourceVersion: FIXTURE_SOURCE_VERSION, isDemo: true,
        recordCount: provider === 'shopify' ? f.orders.length : provider === 'meta' ? f.adInsights.length : provider === 'klaviyo' ? f.klaviyo.length : f.clarity.length },
    });
  }

  // ---- Schema's ----
  for (const s of DEFAULT_MEETING_SCHEDULES) {
    await db.schedule.upsert({
      where: { workspaceId_key: { workspaceId: ws, key: s.key } },
      create: { workspaceId: ws, key: s.key, kind: s.kind, label: s.label, timeOfDay: s.timeOfDay, weekdays: [1, 2, 3, 4, 5], timezone: tz },
      update: {},
    });
  }
  await db.schedule.upsert({
    where: { workspaceId_key: { workspaceId: ws, key: 'morning_brief' } },
    create: { workspaceId: ws, key: 'morning_brief', kind: 'task', label: 'Ochtendbrief', timeOfDay: '08:15', weekdays: [1, 2, 3, 4, 5], timezone: tz },
    update: {},
  });

  // ---- Kennis ----
  const kdir = opts.knowledgeDir;
  if (kdir && existsSync(kdir)) {
    for (const file of readdirSync(kdir).filter((x) => x.endsWith('.md'))) {
      const { meta, body } = parseFrontmatter(readFileSync(path.join(kdir, file), 'utf8'));
      const slug = file.replace(/\.md$/, '');
      await db.knowledgeDocument.upsert({
        where: { workspaceId_slug: { workspaceId: ws, slug } },
        create: { workspaceId: ws, slug, title: meta.title ?? slug, status: meta.status ?? 'draft', ownerName: meta.owner ?? null, source: meta.source ?? 'onbekend', body },
        update: { title: meta.title ?? slug, status: meta.status ?? 'draft', body },
      });
    }
  }

  // ---- Demo-actievoorstel (alleen lokale review; executor uitgeschakeld) ----
  const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000);
  const bound = {
    provider: 'meta',
    accountRef: 'act_demo_0001',
    targetObject: 'adset:demo_adset_42',
    operation: 'adset.update_daily_budget',
    payload: { oldDailyBudgetMinor: 5000, newDailyBudgetMinor: 4000, currency: 'EUR' },
    preconditions: { currentDailyBudgetMinor: 5000, maxChangePct: 25, freshnessMaxHours: 6 },
    expiresAt: expiresAt.toISOString(),
  };
  await db.actionProposal.create({
    data: {
      workspaceId: ws, ...bound, payload: bound.payload, preconditions: bound.preconditions, expiresAt,
      payloadHash: proposalHash(bound), risk: 'laag — demo; niets wordt extern uitgevoerd',
      evidence: [{ kind: 'source_record', id: 'act_demo_0001', label: 'Demo Meta-account' }], status: 'pending_approval', isDemo: true,
      createdById: 'usr_demo_operator',
    },
  });
  await db.auditEvent.create({ data: { workspaceId: ws, action: 'seed.demo', detail: { fixtures: FIXTURE_SOURCE_VERSION } } });
  return { workspaceId: ws, created: true };
}
