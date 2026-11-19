import { ConnectorError, type Connector, type ProbeResult } from '../index';
import { CmvaSummarySchema, type CmvaSummary } from './schema';

export interface CmvaConfig {
  base: string;
  token: string;
  profile: string;
}
export function cmvaConfig(env: Record<string, string | undefined> = process.env): CmvaConfig {
  const base = env.CMVA_API_BASE ?? '';
  const token = env.CMVA_AI_SUMMARY_TOKEN ?? '';
  const profile = env.CMVA_STORE_PROFILE ?? '';
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new ConnectorError('auth', 'CMVA_API_BASE ontbreekt of is ongeldig.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new ConnectorError('auth', 'CMVA_API_BASE moet een HTTPS-adres zonder credentials of query zijn.');
  if (!token.trim() || !/^[a-z0-9-]{1,40}$/.test(profile))
    throw new ConnectorError('auth', 'Stel CMVA_AI_SUMMARY_TOKEN en CMVA_STORE_PROFILE serverzijdig in.');
  return { base, token, profile };
}

export class CmvaClient {
  constructor(
    private config: CmvaConfig,
    private request: typeof fetch = fetch,
  ) {}

  async summary(days = 30): Promise<CmvaSummary> {
    if (!Number.isInteger(days) || days < 1 || days > 120)
      throw new ConnectorError('schema_change', 'CMVA days moet 1 t/m 120 zijn.');
    // Revalidate even when instantiated directly. Never send credentials to redirects.
    cmvaConfig({
      CMVA_API_BASE: this.config.base,
      CMVA_AI_SUMMARY_TOKEN: this.config.token,
      CMVA_STORE_PROFILE: this.config.profile,
    });
    const url = new URL(`${this.config.base.replace(/\/+$/, '')}/api/public/ai/summary`);
    url.searchParams.set('store', this.config.profile);
    url.searchParams.set('days', String(days));
    let response: Response;
    try {
      response = await this.request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.token}` },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new ConnectorError('provider_outage', 'CMVA is niet bereikbaar of reageert niet op tijd.');
    }
    if (response.status === 401 || response.status === 403)
      throw new ConnectorError('auth', 'CMVA weigert de authenticatie.');
    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const seconds =
        raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : NaN;
      throw new ConnectorError(
        'rate_limit',
        'CMVA verzoeklimiet bereikt.',
        Number.isFinite(seconds) ? Math.max(1, seconds) : 60,
      );
    }
    if (!response.ok) throw new ConnectorError('provider_outage', 'CMVA retourneert een providerfout.');
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ConnectorError('schema_change', 'CMVA geeft geen geldige JSON terug.');
    }
    const parsed = CmvaSummarySchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.stores.length !== 1 ||
      parsed.data.stores[0]?.store !== this.config.profile
    )
      throw new ConnectorError(
        'schema_change',
        'CMVA respons wijkt af of het gekozen winkelprofiel ontbreekt.',
      );
    return parsed.data;
  }

  async probe(): Promise<ProbeResult> {
    try {
      await this.summary(1);
      return {
        ok: true,
        state: 'connected',
        checkedAt: new Date().toISOString(),
        message: 'CMVA leesproef geslaagd.',
      };
    } catch (e) {
      const error =
        e instanceof ConnectorError ? e : new ConnectorError('provider_outage', 'CMVA leesproef mislukt.');
      return {
        ok: false,
        state: error.kind === 'rate_limit' ? 'limited' : 'action_required',
        checkedAt: new Date().toISOString(),
        message: error.message,
      };
    }
  }
}

export const cmvaConnector: Connector = {
  provider: 'cmva',
  label: 'cmva',
  isFixture: false,
  capabilities: () => [
    {
      resource: 'ai_summary',
      operation: 'read',
      note: 'Opgeslagen dashboarddocumenten; geen verse kanaalsync gegarandeerd.',
    },
  ],
  implementationRules: [
    'Bronbedragen EUR; geen AUD-conversie zonder koers.',
    'DD-MM-jaaraanname vastleggen in Sydney-tijd.',
    'Profiel expliciet aan workspace binden.',
  ],
  async probe() {
    try {
      return await new CmvaClient(cmvaConfig()).probe();
    } catch {
      return {
        ok: false,
        state: 'action_required',
        checkedAt: new Date().toISOString(),
        message: 'Controleer de serverzijdige CMVA-configuratie.',
      };
    }
  },
};
