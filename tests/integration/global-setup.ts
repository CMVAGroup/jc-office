// Integratietests draaien tegen een aparte database (jc_office_test) op dezelfde lokale PostgreSQL.
// Vereist dat de database draait (pnpm db:start of pnpm demo).
import { execSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from '../../scripts/env.mjs';

const root = path.resolve(import.meta.dirname, '../..');

export async function setup() {
  loadEnv(root);
  const base = new URL(process.env.DATABASE_URL!);
  const testUrl = new URL(base);
  testUrl.pathname = '/jc_office_test';
  process.env.TEST_DATABASE_URL = testUrl.toString();
  const admin = new pg.Client({ connectionString: base.toString() });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS jc_office_test WITH (FORCE)');
  await admin.query('CREATE DATABASE jc_office_test');
  await admin.end();
  execSync('npx prisma migrate deploy', {
    cwd: path.join(root, 'packages/db'),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: 'pipe',
  });
}
