import { z } from 'zod';

const number = z.number().finite();
const roas = number.nullable();
const money = {
  revenue_eur: number,
  ad_spend_eur: number,
  cogs_eur: number,
  transaction_fees_eur: number,
  refunds_eur: number,
  profit_eur: number,
};
export const CmvaSummarySchema = z.object({
  generated_at: z.string().datetime(),
  stores: z.array(
    z.object({
      store: z.string().regex(/^[a-z0-9-]{1,40}$/),
      note: z.literal("Dates are DD-MM in the shop's own timezone. Amounts in EUR."),
      totals: z.object({
        days: number.int().nonnegative(),
        orders: number.int().nonnegative(),
        ...money,
        roas,
      }),
      per_day: z.array(
        z.object({
          date: z.string().regex(/^\d{2}-\d{2}$/),
          orders: number.int().nonnegative(),
          ...money,
          front_end_profit_eur: number,
          roas,
        }),
      ),
      products: z.array(
        z.object({
          name: z.string().optional(),
          status: z.string().optional(),
          cost_eur: number,
          sell_eur: number,
          active_ads: number,
          test_date: z.string().optional(),
          kill_reason: z.string().optional(),
        }),
      ),
      expenses: z.array(
        z.object({
          name: z.string().optional(),
          amount_eur: number,
          date: z.string().optional(),
          category: z.string().optional(),
        }),
      ),
    }),
  ),
});
export type CmvaSummary = z.infer<typeof CmvaSummarySchema>;
// Endpoint has no version field. Pin the reviewed route contract, not the data's freshness.
export const CMVA_SOURCE_VERSION = 'ai-summary:27492f218a3e07193a0db43d5ad8e6d9baf31149';

export const CmvaInboxTicketSchema = z.object({
  id: z.string().min(1),
  inbound_message_id: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  created_at: z.string(),
});
export type CmvaInboxTicket = z.infer<typeof CmvaInboxTicketSchema>;

export const CmvaInboxSchema = z.object({
  tickets: z.array(CmvaInboxTicketSchema),
});
export type CmvaInbox = z.infer<typeof CmvaInboxSchema>;
