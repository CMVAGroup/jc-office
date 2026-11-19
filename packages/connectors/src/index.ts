// Gedeeld connectorcontract. Fase 1: alleen fixtures; status 'demo_not_connected' totdat een echte API-proef slaagt.
import { cmvaConnector } from './cmva/client';
export * from './fixtures';
export * from './cmva/client';
export * from './cmva/schema';
export * from './cmva/normalize';

export type Provider = 'cmva' | 'shopify' | 'meta' | 'klaviyo' | 'clarity';

export type ConnectionState = 'demo_not_connected' | 'connected' | 'limited' | 'stale' | 'action_required';

export type ConnectorErrorKind = 'auth' | 'permission' | 'rate_limit' | 'provider_outage' | 'schema_change';

export class ConnectorError extends Error {
  constructor(
    public kind: ConnectorErrorKind,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

export interface Capability {
  resource: string;
  operation: 'read'; // fase 1 en tot de writerfase: uitsluitend lezen
  note?: string;
}

export interface ProbeResult {
  ok: boolean;
  state: ConnectionState;
  checkedAt: string;
  message: string;
}

export interface Connector {
  provider: Provider;
  label: string;
  /** Verbinding controleren via een echte API-proef. Fixtures geven nooit 'connected'. */
  probe(): Promise<ProbeResult>;
  capabilities(): Capability[];
  /** Volgende-fase-notities die bij implementatie verplicht zijn. */
  implementationRules: string[];
  isFixture: boolean;
}

function fixtureConnector(provider: Provider, label: string, caps: Capability[], rules: string[]): Connector {
  return {
    provider,
    label,
    isFixture: true,
    capabilities: () => caps,
    implementationRules: rules,
    async probe() {
      return {
        ok: false,
        state: 'demo_not_connected',
        checkedAt: new Date().toISOString(),
        message: 'Demo/niet gekoppeld — fixturedata, geen API-proef uitgevoerd.',
      };
    },
  };
}

export const CONNECTORS: Record<Provider, Connector> = {
  cmva: cmvaConnector,
  shopify: fixtureConnector(
    'shopify',
    'Shopify',
    [
      { resource: 'orders', operation: 'read' },
      { resource: 'refunds', operation: 'read' },
      { resource: 'products', operation: 'read' },
      { resource: 'inventory', operation: 'read' },
    ],
    [
      'Admin GraphQL, vastgepinde ondersteunde versie (verifiëren bij bouwstart; plan noemt 2026-10).',
      'Minimale leesscopes: read_orders, read_products, read_inventory, evt. read_locations.',
      'Standaard 60 dagen orderhistorie; meer vereist extra toegang of expliciete export.',
      'Webhooks: HMAC over raw body, duurzaam opslaan, dedup op event-ID, actuele toestand herlezen, nachtelijke reconciliatie.',
    ],
  ),
  meta: fixtureConnector(
    'meta',
    'Meta Ads',
    [{ resource: 'ad_insights', operation: 'read', note: 'ads_read' }],
    [
      'Begin met ads_read; budgetwrites blijven uit tot de writerfase.',
      'Sla accountzone, valuta, attribution window, action report time en grain op.',
    ],
  ),
  klaviyo: fixtureConnector(
    'klaviyo',
    'Klaviyo',
    [
      { resource: 'campaign_values', operation: 'read', note: 'Rapport-POST is een leesoperatie' },
      { resource: 'flow_values', operation: 'read' },
    ],
    [
      'Geldige revision-header pinnen; echte conversion metric-ID uit het account kiezen.',
      'Endpointgebonden rate limits + Retry-After; geen campagneverzending of flowactivatie.',
    ],
  ),
  clarity: fixtureConnector(
    'clarity',
    'Microsoft Clarity',
    [{ resource: 'data_export', operation: 'read', note: 'geaggregeerde snapshots' }],
    [
      'Actuele limieten controleren; ontwerp op ±10 requests/dag, 1–3 dagen terugblik, max. 3 dimensies, 1.000 rijen.',
      'Rollende snapshots nooit optellen; geen belofte van recording/heatmapexports.',
    ],
  ),
};
