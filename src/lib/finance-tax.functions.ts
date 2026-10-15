import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const integer = z.string().regex(/^-?\d+$/),
  uuid = z.string().uuid();
const allocation = z.object({
  category: z.enum(["receipts", "goods", "operating", "fees", "asset", "excluded"]),
  amount: integer,
  turnover: integer,
});
const review = z.object({
  id: uuid,
  tax_date: z.string(),
  document_id: uuid,
  reason: z.string(),
  allocations: z.array(allocation),
});
const schema = z.object({
  journals: z.array(
    z.object({
      id: uuid,
      booking_date: z.string(),
      memo: z.string(),
      source: z.object({ reference: z.string(), kind: z.string().optional() }),
      reversal_of: uuid.nullable(),
      net: integer,
      review: review.nullable(),
    }),
  ),
  totals: z.array(z.object({ category: z.string(), amount: integer })),
  turnover: integer,
  previousTurnover: integer,
  positiveTurnover: integer,
  unreviewed: integer,
  drafts: integer,
  closedPeriods: integer,
  rules: z.object({
    firstYear: z.number(),
    currentLimit: integer,
    previousLimit: integer,
    verifiedOn: z.string(),
  }),
});
export const financeTaxList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        year: z.number().int().min(2026).max(2100),
        page: z.number().int().min(0).max(100000),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_tax_list", {
      p_year: data.year,
      p_page: data.page,
    });
    if (r.error)
      throw new Error(
        r.error.code === "PGRST202"
          ? "Apply the tax review migration before use."
          : r.error.message,
      );
    return schema.parse(r.data);
  });
export const financeTaxReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: uuid,
        journal: uuid,
        date: z.string().date(),
        document: uuid,
        reason: z.string().trim().min(10).max(1000),
        allocations: z.array(allocation).min(1).max(50),
        replaces: uuid.nullable(),
        confirmed: z.literal(true),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_tax_review", {
      p_id: data.id,
      p_journal: data.journal,
      p_date: data.date,
      p_document: data.document,
      p_reason: data.reason,
      p_allocations: data.allocations,
      p_replaces: data.replaces,
    });
    if (r.error) throw new Error(r.error.message);
    return { id: uuid.parse(r.data) };
  });
