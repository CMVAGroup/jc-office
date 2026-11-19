// Zes versieerbare rolconfiguraties. Een rol is geen permanent draaiend proces: hij start alleen voor een opdracht.
import type { AgentRole, SchemaName } from '@jc/domain';
import type { ToolName } from './tools';

export interface RoleConfig {
  id: AgentRole;
  label: string;
  goal: string;
  allowedTools: ToolName[];
  inputDescription: string;
  outputSchema: SchemaName | null;
  sourceRequirements: string[];
  limits: string[];
  timeoutSec: number;
  tokenBudget: number;
  modelAlias: string;
  promptVersion: string;
  implemented: boolean;
  desk: { label: string };
}

const MODEL = process.env.MODEL_PROVIDER === 'ollama' ? process.env.OLLAMA_MODEL || 'hermes3' : process.env.MODEL_ALIAS || 'claude-opus-5-5';

export const ROLE_CONFIGS: Record<AgentRole, RoleConfig> = {
  lead: {
    id: 'lead',
    label: 'Office Lead (baas)',
    goal: 'Ochtendbrief met maximaal drie prioriteiten; opdrachten verdelen; vergaderingen leiden.',
    allowedTools: ['metrics.read', 'tasks.recent', 'knowledge.search', 'proposal.create'],
    inputDescription: 'Geverifieerde findings van de Analyst, open taken, gepubliceerde kennis',
    outputSchema: 'morning_brief',
    sourceRequirements: ['analyst_report'],
    limits: ['Geen directe platformschrijfrechten', 'Kan grenzen en approvals niet aanpassen', 'Hoogstens drie deeltaken, geen recursieve delegatie'],
    timeoutSec: 120,
    tokenBudget: 4000,
    modelAlias: MODEL,
    promptVersion: 'lead-2026-11-19.1',
    implemented: true,
    desk: { label: 'Baasbureau' },
  },
  analyst: {
    id: 'analyst',
    label: 'Commerce Analyst',
    goal: 'Dag/weekrapport, afwijkingen en aansluiting tussen bronnen, uitsluitend uit geteste metricfuncties.',
    allowedTools: ['metrics.read', 'products.lookup', 'knowledge.search'],
    inputDescription: 'Metricsnapshots (Shopify-orders, Meta-spend, Klaviyo-attributie), voorraad',
    outputSchema: 'analyst_report',
    sourceRequirements: ['shopify', 'meta'],
    limits: ['Berekeningen alleen via geteste functies', 'Ontbrekende kosten = marge onbekend'],
    timeoutSec: 90,
    tokenBudget: 4000,
    modelAlias: MODEL,
    promptVersion: 'analyst-2026-11-19.1',
    implemented: true,
    desk: { label: 'Analysebureau' },
  },
  growth: {
    id: 'growth',
    label: 'Growth & Creative',
    goal: 'Analyse op advertentieniveau, hooks, creativebriefs, testvoorstellen.',
    allowedTools: ['metrics.read', 'products.lookup', 'knowledge.search', 'proposal.create'],
    inputDescription: 'Meta-prestaties, productfeed, voorraad, merkregels',
    outputSchema: null,
    sourceRequirements: ['meta'],
    limits: ['Geen automatische budgetwijzigingen', 'Geen ongefundeerde productclaims'],
    timeoutSec: 120,
    tokenBudget: 4000,
    modelAlias: MODEL,
    promptVersion: 'growth-0',
    implemented: false,
    desk: { label: 'Growth-bureau' },
  },
  retention: {
    id: 'retention',
    label: 'Retention',
    goal: 'Flow-audit, campagneconcepten, onderwerpregels, segmentdefinities.',
    allowedTools: ['metrics.read', 'knowledge.search'],
    inputDescription: 'Klaviyo-rapporten, merkstem, beleid',
    outputSchema: null,
    sourceRequirements: ['klaviyo'],
    limits: ['Geen verzending', 'Conceptsegment is geen aangemaakte doelgroep'],
    timeoutSec: 120,
    tokenBudget: 4000,
    modelAlias: MODEL,
    promptVersion: 'retention-0',
    implemented: false,
    desk: { label: 'Retentiebureau' },
  },
  cro: {
    id: 'cro',
    label: 'CRO & Experience',
    goal: 'Geprioriteerde frictielijst en experimentkaarten uit geaggregeerde Clarity-signalen.',
    allowedTools: ['metrics.read', 'knowledge.search'],
    inputDescription: 'Clarity-snapshots, pagina-informatie, gevalideerde conversiedata',
    outputSchema: null,
    sourceRequirements: ['clarity'],
    limits: ['Geen causale claims uit observaties', 'Geen live themapublicatie'],
    timeoutSec: 120,
    tokenBudget: 4000,
    modelAlias: MODEL,
    promptVersion: 'cro-0',
    implemented: false,
    desk: { label: 'CRO-bureau' },
  },
  merch: {
    id: 'merch',
    label: 'Merchandising & Operations',
    goal: 'Voorraadrisico, bundelvoorstellen, productcopy- en supportconcepten.',
    allowedTools: ['metrics.read', 'products.lookup', 'knowledge.search'],
    inputDescription: 'SKU’s, voorraad per locatie, verkoopsnelheid, beleid',
    outputSchema: null,
    sourceRequirements: ['shopify'],
    limits: ['Geen inkopen, refunds of klantberichten', 'Geen verzonnen levertijden'],
    timeoutSec: 120,
    tokenBudget: 4000,
    modelAlias: MODEL,
    promptVersion: 'merch-0',
    implemented: false,
    desk: { label: 'Operationsbureau' },
  },
};
