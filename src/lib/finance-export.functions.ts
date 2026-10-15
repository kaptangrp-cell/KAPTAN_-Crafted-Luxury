import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ReportSchema } from "./finance/reports";
export const financeExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({ from: z.string().date(), to: z.string().date() })
      .refine((v) => v.from <= v.to)
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_export", {
      p_from: data.from,
      p_to: data.to,
    });
    if (r.error) throw new Error(r.error.message);
    return z
      .object({
        generatedAt: z.string(),
        from: z.string(),
        to: z.string(),
        mapping: z.literal("internal-unmapped"),
        report: ReportSchema,
        lines: z.array(
          z.object({
            journal_id: z.string().uuid(),
            external_key: z.string(),
            booking_date: z.string(),
            memo: z.string(),
            status: z.enum(["draft", "posted"]),
            source: z.string(),
            reversal_of: z.string().uuid().nullable(),
            line_no: z.number(),
            account: z.string(),
            debit: z.string().regex(/^\d+$/),
            credit: z.string().regex(/^\d+$/),
          }),
        ),
      })
      .parse(r.data);
  });
