// Beperkte toolregistry. Standaard verboden; alleen expliciet toegestane operaties per rol.
// Geen shell, browser, vrije HTTP of SQL. De backend implementeert iedere tool met gevalideerde parameters
// en workspacecontrole (zie apps/worker/src/tool-impl.ts).
import { z } from 'zod';
import type { AgentRole } from '@jc/domain';
import { ROLE_CONFIGS } from './roles';

export type OperationClass = 'read' | 'local_write';

export const TOOL_DEFS = {
  'metrics.read': {
    operation: 'read' as OperationClass,
    description: 'Lees opgeslagen metricsnapshots voor een periode.',
    params: z.object({ fromLocal: z.string(), toLocal: z.string() }).strict(),
  },
  'products.lookup': {
    operation: 'read' as OperationClass,
    description: 'Zoek producten/varianten en voorraad op SKU.',
    params: z.object({ skus: z.array(z.string()).max(50) }).strict(),
  },
  'knowledge.search': {
    operation: 'read' as OperationClass,
    description: 'Zoek in kennisdocumenten. Alleen status published is bindend.',
    params: z.object({ query: z.string().max(200) }).strict(),
  },
  'tasks.recent': {
    operation: 'read' as OperationClass,
    description: 'Recente taken en resultaten in deze workspace.',
    params: z.object({ sinceIso: z.string() }).strict(),
  },
  'proposal.create': {
    operation: 'local_write' as OperationClass,
    description: 'Maak een LOKAAL actievoorstel (status draft). Voert nooit iets extern uit.',
    params: z
      .object({ provider: z.string(), operation: z.string(), targetObject: z.string(), payload: z.record(z.string(), z.unknown()) })
      .strict(),
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFS;

export class ToolNotAllowedError extends Error {}

export interface ToolContext {
  workspaceId: string;
  taskId: string;
}

export type ToolImpl = {
  [K in ToolName]: (params: z.infer<(typeof TOOL_DEFS)[K]['params']>, ctx: ToolContext) => Promise<unknown>;
};

export interface ToolCallRecord {
  tool: string;
  ok: boolean;
  error?: string;
  at: string;
}

/** Roept een tool aan namens een rol: controleert allowlist en parameters vóór uitvoering. */
export async function invokeTool(
  role: AgentRole,
  name: string,
  rawParams: unknown,
  impl: ToolImpl,
  ctx: ToolContext,
  log: ToolCallRecord[],
): Promise<unknown> {
  const at = new Date().toISOString();
  if (!(name in TOOL_DEFS)) {
    log.push({ tool: name, ok: false, error: 'onbekende tool', at });
    throw new ToolNotAllowedError(`Onbekende tool: ${name}`);
  }
  const tool = name as ToolName;
  if (!ROLE_CONFIGS[role].allowedTools.includes(tool)) {
    log.push({ tool, ok: false, error: 'niet toegestaan voor rol', at });
    throw new ToolNotAllowedError(`Tool ${tool} is niet toegestaan voor rol ${role}`);
  }
  const parsed = TOOL_DEFS[tool].params.safeParse(rawParams);
  if (!parsed.success) {
    log.push({ tool, ok: false, error: 'ongeldige parameters', at });
    throw new ToolNotAllowedError(`Ongeldige parameters voor ${tool}`);
  }
  const fn = impl[tool] as (p: unknown, c: ToolContext) => Promise<unknown>;
  const out = await fn(parsed.data, ctx);
  log.push({ tool, ok: true, at });
  return out;
}

/** Alleen bestaande read-tools; modelinitiatieven krijgen geen extra schrijfrechten. */
export function roleModelTools(role: AgentRole, impl: ToolImpl, ctx: ToolContext, log: ToolCallRecord[]): import('./adapter').ModelTool[] {
  return ROLE_CONFIGS[role].allowedTools.filter((name) => TOOL_DEFS[name].operation === 'read').map((name) => ({
    name,
    description: TOOL_DEFS[name].description,
    parameters: z.toJSONSchema(TOOL_DEFS[name].params, { target: 'draft-7' }),
    execute: (args: unknown) => invokeTool(role, name, args, impl, ctx, log),
  }));
}
