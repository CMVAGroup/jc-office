import { normalizeCmva, type CmvaSummary } from '@jc/connectors';
import type { Db } from './client';

export async function storeCmvaSummary(
  db: Db,
  workspaceId: string,
  profile: string,
  summary: CmvaSummary,
  fetchedAt = new Date(),
  isDemo = false,
) {
  const rows = normalizeCmva(summary, profile);
  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        const { storeProfile, dateLocal, metric } = row;
        const data = { ...row, workspaceId, fetchedAt, isDemo };
        await tx.cmvaDailyMetric.upsert({
          where: {
            workspaceId_storeProfile_dateLocal_metric: { workspaceId, storeProfile, dateLocal, metric },
          },
          create: data,
          update: data,
        });
      }
    },
    { timeout: 30_000 },
  );
  return rows.length;
}

/** Explicit local workspace binding; the upstream API has no workspace filter. */
export async function configureCmvaSync(db: Db, workspaceId: string, profile: string) {
  await db.connection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: 'cmva' } },
    create: {
      workspaceId,
      provider: 'cmva',
      accountRef: profile,
      status: 'action_required',
      scopes: ['summary:read'],
      currency: 'EUR',
      accountTimezone: 'Australia/Sydney',
    },
    update: {},
  });
  const conn = await db.connection.findUniqueOrThrow({
    where: { workspaceId_provider: { workspaceId, provider: 'cmva' } },
  });
  if (conn.accountRef !== profile)
    throw new Error(
      'CMVA profiel verschilt van de workspacebinding; laat de eigenaar de koppeling controleren.',
    );
  await db.schedule.upsert({
    where: { workspaceId_key: { workspaceId, key: 'cmva_sync' } },
    create: {
      workspaceId,
      key: 'cmva_sync',
      kind: 'task',
      label: 'CMVA elk uur',
      timeOfDay: '00:00',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      timezone: 'UTC',
      maxCatchUpMinutes: 60,
    },
    update: {},
  });
}
