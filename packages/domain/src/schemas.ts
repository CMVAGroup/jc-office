// Uitvoerschema's voor agents en vergaderingen. Elke numerieke bewering verwijst naar bewijs.
import { z } from 'zod';
import { AGENT_ROLES } from './roles';

export const RESULT_SCHEMA_VERSION = '1';

export const EvidenceRefSchema = z.object({
  kind: z.enum(['metric_snapshot', 'task', 'artifact', 'source_record']),
  id: z.string().min(1),
  label: z.string().optional(),
});
export type EvidenceRefT = z.infer<typeof EvidenceRefSchema>;

export const FactSchema = z.object({
  statement: z.string().min(1),
  metricKey: z.string().optional(),
  value: z.number().nullable().optional(),
  evidence: z.array(EvidenceRefSchema).min(1, 'Elk feit heeft bewijs nodig'),
});

export const HypothesisSchema = z.object({
  statement: z.string().min(1),
  evidence: z.array(EvidenceRefSchema),
  confidence: z.enum(['laag', 'middel', 'hoog']),
});

export const FreshnessSchema = z.object({
  source: z.string(),
  fetchedAt: z.string().nullable(),
  status: z.enum(['vers', 'verouderd', 'ontbreekt', 'demo']),
  note: z.string().optional(),
});

export const PrioritySchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  ownerRole: z.enum(AGENT_ROLES),
  evidence: z.array(EvidenceRefSchema).min(1, 'Elke prioriteit heeft bewijs nodig'),
  deadline: z.string().optional(),
});

export const TaskResultSchema = z.object({
  summary: z.string().min(1),
  facts: z.array(FactSchema),
  hypotheses: z.array(HypothesisSchema),
  recommendations: z.array(z.string()),
  sourceRecords: z.array(EvidenceRefSchema),
  period: z.object({ from: z.string(), to: z.string(), timezone: z.string() }),
  freshness: z.array(FreshnessSchema),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  missingData: z.array(z.string()),
  artifacts: z.array(z.string()),
  proposedAction: z
    .object({ operation: z.string(), description: z.string(), requiresApproval: z.literal(true) })
    .nullable(),
  isDemo: z.boolean(),
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

export const AnalystReportSchema = TaskResultSchema;

export const MorningBriefSchema = TaskResultSchema.extend({
  priorities: z.array(PrioritySchema).max(3, 'Maximaal drie prioriteiten'),
});
export type MorningBrief = z.infer<typeof MorningBriefSchema>;

export const MeetingSynthesisSchema = z.object({
  summary: z.string().min(1),
  priorities: z
    .array(
      z.object({
        title: z.string().min(1),
        ownerRole: z.enum(AGENT_ROLES),
        deadline: z.string().nullable(),
        evidence: z.array(EvidenceRefSchema),
      }),
    )
    .max(3),
  actions: z.array(
    z.object({ ownerRole: z.enum(AGENT_ROLES), description: z.string().min(1), dueAt: z.string().nullable() }),
  ),
  ownerDecisions: z.array(z.object({ question: z.string().min(1), context: z.string() })),
  externalWritesAuthorized: z.literal(false),
  isDemo: z.boolean(),
});
export type MeetingSynthesis = z.infer<typeof MeetingSynthesisSchema>;

export const CsDraftSchema = z.object({
  ticketId: z.string().min(1),
  subject: z.string().min(1),
  draftBody: z.string().min(1),
  tone: z.string().min(1),
  reasoning: z.string().min(1),
});
export type CsDraft = z.infer<typeof CsDraftSchema>;

export const CsReviewSchema = z.object({
  ticketId: z.string().min(1),
  improvedBody: z.string().min(1),
  changes: z.string().min(1),
  approved: z.boolean(),
});
export type CsReview = z.infer<typeof CsReviewSchema>;

export const SCHEMAS = {
  analyst_report: AnalystReportSchema,
  morning_brief: MorningBriefSchema,
  meeting_synthesis: MeetingSynthesisSchema,
  cs_draft: CsDraftSchema,
  cs_review: CsReviewSchema,
} as const;
export type SchemaName = keyof typeof SCHEMAS;

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}
