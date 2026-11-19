import path from 'node:path';
import { MockModelAdapter, Semaphore, type ModelAdapter } from '@jc/agents';
import { createPrisma, seedDemo, type Db } from '@jc/db';
import type { WorkerDeps } from '../../apps/worker/src/deps';

const root = path.resolve(import.meta.dirname, '../..');

export function testUrl() {
  const base = new URL(process.env.DATABASE_URL ?? 'postgresql://jc:jc_local_only@127.0.0.1:54329/jc_office');
  base.pathname = '/jc_office_test';
  return base.toString();
}

let shared: Db | null = null;
export function testDb(): Db {
  if (!shared) {
    process.env.DATABASE_URL = testUrl();
    shared = createPrisma(testUrl());
  }
  return shared;
}

export async function resetAndSeed(db: Db, now = new Date()) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`);
  await seedDemo(db, { now, knowledgeDir: path.join(root, 'knowledge/julie-claire') });
}

export function deps(db: Db, opts: { adapter?: ModelAdapter; workerId?: string } = {}): WorkerDeps {
  return {
    db,
    adapter: opts.adapter ?? new MockModelAdapter(),
    sem: new Semaphore(2),
    workerId: opts.workerId ?? 'test-worker',
    log: () => {},
    heartbeatMs: 200,
    meetingVisualSec: 1,
  };
}
