// Gedeelde identiteit van de zes agentrollen. Volledige rolconfiguraties staan in @jc/agents.

export const AGENT_ROLES = ['lead', 'analyst', 'growth', 'retention', 'cro', 'merch'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const ROLE_LABELS: Record<AgentRole, string> = {
  lead: 'Office Lead (baas)',
  analyst: 'Commerce Analyst',
  growth: 'Growth & Creative',
  retention: 'Retention',
  cro: 'CRO & Experience',
  merch: 'Merchandising & Operations',
};

/** Fase 1: alleen Lead en Analyst zijn van begin tot eind geïmplementeerd. */
export const IMPLEMENTED_ROLES: ReadonlySet<AgentRole> = new Set<AgentRole>(['lead', 'analyst']);

export function isAgentRole(x: unknown): x is AgentRole {
  return typeof x === 'string' && (AGENT_ROLES as readonly string[]).includes(x);
}

export const USER_ROLES = ['owner', 'operator', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];
