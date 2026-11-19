// Eén commando voor de lokale demo: database → migraties → Prisma-client → seed → worker + web.
// Gebruik: pnpm demo   (stoppen met Ctrl+C)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
import { startDb } from './db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);
const dbDir = path.join(root, 'packages', 'db');

function run(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`[demo] mislukt: ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

const external = process.argv.includes('--external-db');
const pg = external ? null : await startDb({ quiet: true });
if (!existsSync(path.join(dbDir, 'src', 'generated', 'prisma', 'client.ts'))) run('npx prisma generate', dbDir);
run('npx prisma migrate deploy', dbDir);
run('npx tsx src/seed.ts', dbDir);

const children = [];
function start(name, cmd, cwd) {
  const c = spawn(cmd, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const prefix = (d) => d.toString().split(/\r?\n/).filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  c.stdout.on('data', (d) => process.stdout.write(prefix(d)));
  c.stderr.on('data', (d) => process.stderr.write(prefix(d)));
  c.on('exit', (code) => console.log(`[demo] ${name} gestopt (${code})`));
  children.push(c);
}
start('worker', 'npx tsx src/main.ts', path.join(root, 'apps', 'worker'));
start('web', `npx next dev -H 127.0.0.1 -p ${process.env.WEB_PORT ?? 3210}`, path.join(root, 'apps', 'web'));
console.log(`\n[demo] Open http://127.0.0.1:${process.env.WEB_PORT ?? 3210} en kies een demogebruiker.\n`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('[demo] stoppen…');
  for (const c of children) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  if (pg) await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
