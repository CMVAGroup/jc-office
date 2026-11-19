import os from 'node:os';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { databaseUrl } from './container-env.mjs';

let client;
try {
  const pid = readFileSync(process.env.WORKER_PID_FILE || '/tmp/jc-office-worker.pid', 'utf8').trim();
  if (!/^\d+$/.test(pid)) throw new Error();
  client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 4000, query_timeout: 4000 });
  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM worker_heartbeats WHERE worker_id = $1 AND last_beat_at > now() - interval '60 seconds'",
    [os.hostname() + '-' + pid],
  );
  process.exitCode = result.rowCount === 1 ? 0 : 1;
} catch { process.exitCode = 1; }
finally { if (client) await client.end().catch(() => {}); }
