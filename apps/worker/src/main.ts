// Worker: queue-consumer, dispatcher, scheduler, watchdog en vergaderafhandeling.
// Draait los van de webapp; vergaderverslagen en taken lopen ook zonder geopende browser.
import path from 'node:path';
import os from 'node:os';
import { config } from 'dotenv';
import { PgBoss } from 'pg-boss';
import { createModelAdapter, modelConfigFromEnv, Semaphore } from '@jc/agents';
import { getPrisma } from '@jc/db';
import type { WorkerDeps } from './deps';
import { dueForDispatch, processTask } from './tasks';
import { runSchedulerTick } from './scheduler';
import { runWatchdogTick } from './watchdog';
import { advanceMeetings } from './meetings';

config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const QUEUE = 'agent-task';
const workerId = `${os.hostname()}-${process.pid}`;
const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(`[worker ${new Date().toISOString()}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`);

if (process.env.EXTERNAL_WRITES_ENABLED === 'true') {
  log('EXTERNAL_WRITES_ENABLED=true genegeerd: externe writes zijn in fase 1 hard uitgeschakeld.');
}

const db = getPrisma();
const adapter = createModelAdapter(modelConfigFromEnv());
const maxRuns = Math.min(2, Number(process.env.MODEL_MAX_CONCURRENT_RUNS ?? 2));
const deps: WorkerDeps = {
  db,
  adapter,
  sem: new Semaphore(maxRuns),
  workerId,
  log,
  dailyBudgetUsd: Number(process.env.MODEL_DAILY_BUDGET_USD ?? 5),
  meetingVisualSec: Number(process.env.MEETING_VISUAL_SECONDS ?? 45),
};
log(`start; modeladapter=${adapter.name}${adapter.isMock ? ' (MOCK — geen taalmodel, geen kosten)' : ''}; max ${maxRuns} modelruns tegelijk`);

const boss = new PgBoss(process.env.DATABASE_URL!);
boss.on('error', (e: unknown) => log('pg-boss fout', { error: String(e) }));
await boss.start();
await boss.createQueue(QUEUE, { retryLimit: 1, expireInSeconds: 900 }).catch(() => {});

// Concurrency: 4 jobslots (demo-taken wachten veel), maar modelruns zijn apart begrensd op 2 via de semaphore.
await boss.work<{ taskId: string }>(QUEUE, { localConcurrency: 4, batchSize: 1, pollingIntervalSeconds: 0.5 }, async (jobs) => {
  for (const job of jobs) await processTask(deps, job.data.taskId);
});

async function safe(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    log(`${name} fout`, { error: (e as Error).message });
  }
}

let stopping = false;
const timers: NodeJS.Timeout[] = [];
function every(ms: number, name: string, fn: () => Promise<unknown>) {
  let busy = false;
  const t = setInterval(async () => {
    if (busy || stopping) return;
    busy = true;
    await safe(name, fn);
    busy = false;
  }, ms);
  timers.push(t);
  void safe(name, fn);
}

every(1000, 'dispatcher', async () => {
  for (const t of await dueForDispatch(db)) {
    await boss.send(QUEUE, { taskId: t.id });
    await db.task.update({ where: { id: t.id }, data: { dispatchedAt: new Date() } });
  }
});
every(Number(process.env.SCHEDULER_TICK_SECONDS ?? 20) * 1000, 'scheduler', () => runSchedulerTick(deps));
every(Number(process.env.WATCHDOG_INTERVAL_SECONDS ?? 15) * 1000, 'watchdog', () => runWatchdogTick(deps));
every(3000, 'meetings', () => advanceMeetings(deps));
every(10_000, 'worker-heartbeat', () =>
  db.workerHeartbeat.upsert({
    where: { workerId },
    create: { workerId, startedAt: new Date(), lastBeatAt: new Date(), info: { adapter: adapter.name } },
    update: { lastBeatAt: new Date() },
  }),
);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  log('stoppen…');
  timers.forEach(clearInterval);
  await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
