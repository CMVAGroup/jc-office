import { defineConfig } from '@playwright/test';

// E2E tegen de draaiende lokale demo (pnpm demo). Gebruikt de geïnstalleerde Edge, geen browserdownload nodig.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3210',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'node scripts/demo.mjs',
    url: 'http://127.0.0.1:3210/login',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
