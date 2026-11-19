import { CmvaClient, cmvaConfig, CMVA_SOURCE_VERSION, ConnectorError } from '@jc/connectors';
import { storeCmvaSummary, type Db } from '@jc/db';

/** Backend read workflow only. No model and no external writes. */
export async function syncCmva(db: Db, workspaceId: string, client?: CmvaClient, isDemo = false) {
  const conn = await db.connection.findUniqueOrThrow({
    where: { workspaceId_provider: { workspaceId, provider: 'cmva' } },
  });
  const run = await db.syncRun.create({
    data: {
      workspaceId,
      provider: 'cmva',
      kind: 'incremental',
      status: 'running',
      sourceVersion: CMVA_SOURCE_VERSION,
      isDemo,
    },
  });
  try {
    if (!conn.accountRef) throw new ConnectorError('auth', 'CMVA workspace heeft geen winkelprofiel.');
    if (!client) {
      const config = cmvaConfig();
      if (config.profile !== conn.accountRef)
        throw new ConnectorError('auth', 'CMVA profiel verschilt van de workspacebinding.');
      client = new CmvaClient(config);
    }
    // A successful validated summary GET is also the real connection probe.
    const summary = await client.summary(30);
    const count = await storeCmvaSummary(db, workspaceId, conn.accountRef, summary, new Date(), isDemo);
    await db.connection.update({
      where: { workspaceId_provider: { workspaceId, provider: 'cmva' } },
      data: {
        status: isDemo ? 'demo_not_connected' : 'connected',
        lastProbeAt: new Date(),
        lastProbeOk: !isDemo,
        lastError: null,
        isDemo,
        currency: 'EUR',
        accountTimezone: 'Australia/Sydney',
      },
    });
    await db.syncRun.update({
      where: { id: run.id, workspaceId },
      data: { status: 'succeeded', finishedAt: new Date(), recordCount: count },
    });
    return count;
  } catch (e) {
    // Do not persist provider bodies, URL credentials, or arbitrary exception text.
    const error =
      e instanceof ConnectorError
        ? e
        : new ConnectorError('provider_outage', 'CMVA import kon niet worden voltooid.');
    await db.connection.update({
      where: { workspaceId_provider: { workspaceId, provider: 'cmva' } },
      data: {
        status: error.kind === 'rate_limit' ? 'limited' : 'action_required',
        lastProbeAt: new Date(),
        lastProbeOk: false,
        lastError: `${error.kind}: ${error.message}`,
      },
    });
    await db.syncRun.update({
      where: { id: run.id, workspaceId },
      data: { status: 'failed', finishedAt: new Date(), error: `${error.kind}: ${error.message}` },
    });
    throw error;
  }
}
