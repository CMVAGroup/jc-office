import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function login(page: Page, role: 'owner' | 'operator' | 'viewer') {
  await page.goto('/login');
  await page.getByTestId(`login-${role}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function apiLogin(request: APIRequestContext, userId: string) {
  const r = await request.post('/api/auth/demo-login', { form: { userId }, maxRedirects: 0 });
  expect(r.status()).toBe(303);
}

async function waitTask(request: APIRequestContext, id: string, status: string, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const all = (await (await request.get('/api/tasks')).json()) as { id: string; status: string }[];
    if (all.find((t) => t.id === id)?.status === status) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Taak ${id} bereikte ${status} niet`);
}

test.describe('autorisatie en workspace-afbakening', () => {
  test('zonder login: 401; viewer mag niets wijzigen; operator mag niet goedkeuren', async ({ request, playwright }) => {
    expect((await request.get('/api/office/state')).status()).toBe(401);
    expect((await request.post('/api/tasks', { data: { type: 'morning_brief' } })).status()).toBe(401);

    const viewer = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    await apiLogin(viewer, 'usr_demo_viewer');
    expect((await viewer.get('/api/office/state')).status()).toBe(200);
    expect((await viewer.post('/api/tasks', { data: { type: 'morning_brief' } })).status()).toBe(403);
    expect((await viewer.post('/api/demo/stall', { data: {} })).status()).toBe(403);
    expect((await viewer.post('/api/settings/emergency-stop', { data: { active: true } })).status()).toBe(403);

    const op = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    await apiLogin(op, 'usr_demo_operator');
    expect((await op.post('/api/approvals/anything', { data: { decision: 'approved', payloadHash: 'x' } })).status()).toBe(403);
    expect((await op.post('/api/settings/schedules', { data: { key: 'meeting_standup', timeOfDay: '09:00', enabled: true } })).status()).toBe(403);
  });

  test('een gebruiker van een andere workspace ziet geen taken of resultaten van Julie & Claire', async ({ request, playwright }) => {
    const owner = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    await apiLogin(owner, 'usr_demo_owner');
    const tasks = (await (await owner.get('/api/tasks')).json()) as { id: string }[];
    const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    await apiLogin(other, 'usr_other_owner');
    const otherTasks = (await (await other.get('/api/tasks')).json()) as { id: string }[];
    expect(otherTasks.filter((t) => tasks.some((x) => x.id === t.id))).toHaveLength(0);
    if (tasks[0]) {
      expect((await other.post(`/api/tasks/${tasks[0].id}/cancel`)).status()).toBe(404);
      expect((await other.get(`/taken/${tasks[0].id}`)).status()).toBe(404);
    }
    void request;
  });
});

test('ochtendbrief: queue → Analyst → Lead → resultaat met bewijs, max. 3 prioriteiten', async ({ page }) => {
  await login(page, 'owner');
  const created = await page.request.post('/api/tasks', { data: { type: 'morning_brief' } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await waitTask(page.request, id, 'succeeded');
  await page.goto(`/taken/${id}`);
  await expect(page.getByTestId('task-status')).toHaveText('succeeded');
  const prios = page.getByTestId('priorities').locator('> li');
  expect(await prios.count()).toBeGreaterThan(0);
  expect(await prios.count()).toBeLessThanOrEqual(3);
  await expect(page.getByTestId('missing-data')).toContainText('Conversieratio');
  // Bewijslink naar een metricsnapshot werkt en toont formule + bronrecords.
  await page.getByTestId('result').getByRole('link', { name: 'Netto productomzet' }).first().click();
  await expect(page.getByText('Formule:')).toBeVisible();
  await expect(page.getByText(/Onderliggende bronrecords/)).toBeVisible();
  await page.goto('/vandaag');
  await expect(page.getByTestId('kpi-conversion_rate')).toContainText('onbekend');
  await expect(page.getByTestId('kpi-contribution_margin_after_ads')).toContainText('onbekend');
});

test('vergadering: iedereen loopt naar de tafel zonder door meubels te lopen, verslag linkt naar taken', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __office?: unknown }).__office);
  await page.evaluate(() => (window as unknown as { __office: { enableTracking: () => void } }).__office.enableTracking());
  await page.getByTestId('demo-meeting').click();
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __office: { sim: { allAgentsAt: (t: string) => boolean } } }).__office.sim.allAgentsAt('meeting')), { timeout: 40_000 })
    .toBe(true);
  const through = await page.evaluate(() => {
    const s = (window as unknown as { __office: { sim: { visited: { cell: { x: number; y: number } }[]; blocked: Set<string> } } }).__office.sim;
    return { n: s.visited.length, bad: s.visited.filter((v) => s.blocked.has(`${v.cell.x},${v.cell.y}`)).length };
  });
  expect(through.n).toBeGreaterThan(10);
  expect(through.bad).toBe(0);
  // Animatie overslaan verandert geen resultaat: verslag bestaat al.
  await page.getByRole('button', { name: 'Animatie overslaan' }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __office: { sim: { allAgentsAt: (t: string) => boolean } } }).__office.sim.allAgentsAt('desk')), { timeout: 40_000 })
    .toBe(true);
  await page.getByRole('link', { name: 'Volledig verslag' }).click();
  await expect(page.getByTestId('meeting-update')).toHaveCount(6);
  const link = page.getByTestId('update-task-link').first();
  await link.click();
  await expect(page.getByTestId('task-status')).toBeVisible();
});

test('hond: vastgelopen taak → hond naar het juiste bureau met echte oorzaak; rate limit geeft geen alarm', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/');
  const rl = await (await page.request.post('/api/demo/rate-limit')).json();
  const stall = await (await page.request.post('/api/demo/stall', { data: { role: 'cro', durationSec: 120 } })).json();
  await expect(page.getByTestId('alerts')).toContainText('CRO', { timeout: 90_000 });
  await expect(page.getByTestId('alerts')).toContainText('geen voortgang');
  await expect(page.getByTestId('alerts')).not.toContainText('Retentie');
  await expect(page.getByTestId('dog')).toHaveAttribute('data-state', 'alerting', { timeout: 30_000 });
  // De hond loopt naar het snuffelpunt naast het CRO-bureau (9,10) en blijft daar.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const d = (window as unknown as { __office: { sim: { dog: { to: { x: number; y: number }; t: number } } } }).__office.sim.dog;
          return d.t >= 1 ? d.to : null;
        }),
      { timeout: 30_000 },
    )
    .toEqual({ x: 9, y: 10 });
  await page.request.post(`/api/tasks/${stall.id}/cancel`);
  await page.request.post(`/api/tasks/${rl.id}/cancel`);
});

test('verminderde beweging en toegankelijk activiteitenpaneel', async ({ page }) => {
  await login(page, 'viewer');
  await page.goto('/');
  await page.getByLabel('Verminderde beweging').check();
  await expect(page.locator('.office-stage.reduced')).toBeVisible();
  await expect(page.getByTestId('agent-list').locator('li')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Maak ochtendbrief' })).toBeDisabled();
  await page.getByTestId('desk-lead').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Toegestane tools');
});
