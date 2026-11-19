// Runtimeconfiguratie; nooit tijdens docker build met productiecredentials.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function databaseUrl(env = process.env) {
  if (!env.PGUSER || !env.PGPASSWORD || !env.PGDATABASE) throw new Error('Databaseconfiguratie ontbreekt.');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(env.PGUSER) || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(env.PGDATABASE)) {
    throw new Error('POSTGRES_USER en POSTGRES_DB moeten eenvoudige SQL-identifiers zijn (max. 63 tekens).');
  }
  const url = new URL('postgresql://postgres:5432');
  url.username = env.PGUSER;
  url.password = env.PGPASSWORD;
  url.pathname = '/' + env.PGDATABASE;
  return url.toString();
}

export function productionEnvironment(env = process.env) {
  env.NODE_ENV = 'production';
  env.DEMO_MODE = 'false';
  env.EXTERNAL_WRITES_ENABLED = 'false';
  env.DATABASE_URL = databaseUrl(env);
  env.MODEL_PROVIDER ||= 'mock';
  env.ALLOW_REAL_MODEL_RUNS ||= 'false';
  env.MODEL_DAILY_BUDGET_USD ||= '5';
  if (env.SESSION_SECRET !== undefined && (env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('change-me'))) {
    throw new Error('SESSION_SECRET moet een eigen willekeurig geheim van minimaal 32 tekens zijn.');
  }
  return env;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    productionEnvironment();
    const [command, ...args] = process.argv.slice(2);
    if (!command) throw new Error('Startcommando ontbreekt.');
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    if (process.env.WORKER_PID_FILE && child.pid) writeFileSync(process.env.WORKER_PID_FILE, String(child.pid), { mode: 0o600 });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.once('error', () => { console.error('Containerproces kon niet starten.'); process.exitCode = 1; });
    child.once('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
  } catch {
    // Geen URL, wachtwoord, sleutel of procesomgeving in logs.
    console.error('Containerconfiguratie ongeldig. Controleer databasevelden en SESSION_SECRET in de server-.env.');
    process.exitCode = 1;
  }
}
