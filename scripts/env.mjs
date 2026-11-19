import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Laadt .env (maakt hem aan vanuit .env.example als hij ontbreekt). Bestaande env-variabelen winnen. */
export function loadEnv(root) {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) {
    copyFileSync(path.join(root, '.env.example'), envPath);
    console.log('[env] .env aangemaakt vanuit .env.example');
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^"(.*)"$/, '$1');
  }
}
