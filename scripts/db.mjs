// Start een lokale PostgreSQL (embedded-postgres, echte PostgreSQL-binaries via npm) op loopback.
// Gebruik: node scripts/db.mjs [--test]   (blijft draaien tot Ctrl+C)
// Wil je een eigen PostgreSQL gebruiken? Zet DATABASE_URL in .env en sla dit script over.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isTest = process.argv.includes('--test');
loadEnv(root);

const url = new URL(isTest ? process.env.TEST_DATABASE_URL ?? defaultTestUrl() : process.env.DATABASE_URL);
const port = Number(url.port || 5432);
const databaseDir = path.join(root, 'infra', isTest ? 'pgdata-test' : 'pgdata');

function defaultTestUrl() {
  return 'postgresql://jc:jc_local_only@127.0.0.1:54339/jc_office_test';
}

export async function startDb({ quiet = false } = {}) {
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port,
    persistent: true,
    // UTF-8 afdwingen: op Windows kiest initdb anders de systeemcodering (WIN1252).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onLog: quiet ? () => {} : (m) => process.stdout.write(`[pg] ${m}`),
    onError: (m) => process.stderr.write(`[pg] ${m}\n`),
  });
  try {
    if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
      console.log(`[db] initialiseren in ${databaseDir}`);
      await pg.initialise();
    }
    await pg.start();
  } catch (e) {
    console.error(
      `\n[db] PostgreSQL kon niet starten (${e?.message ?? e ?? 'geen details'}).\n` +
        '     Veelvoorkomende oorzaken:\n' +
        '     1. Het venster draait als Administrator — PostgreSQL weigert dat. Open een GEWONE opdrachtprompt/PowerShell.\n' +
        `     2. Poort ${port} is al in gebruik (draait de demo al in een ander venster?).\n`,
    );
    process.exit(1);
  }
  const dbName = url.pathname.replace(/^\//, '');
  try {
    await pg.createDatabase(dbName);
    console.log(`[db] database ${dbName} aangemaakt`);
  } catch {
    // bestaat al
  }
  console.log(`[db] PostgreSQL draait op 127.0.0.1:${port} (${dbName})`);
  return pg;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const pg = await startDb({ quiet: true });
  const stop = async () => {
    console.log('[db] stoppen…');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
