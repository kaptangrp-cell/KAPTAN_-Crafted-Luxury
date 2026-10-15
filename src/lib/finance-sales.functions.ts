import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const financeSalesList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ page: z.number().int().min(0).max(100000) }).parse(x))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_sales_list", {
      p_page: data.page,
    });
    if (r.error)
      throw new Error(
        r.error.code === "PGRST202"
          ? "Apply the sales inbox migration before use."
          : r.error.message,
      );
    return z
      .array(
        z.object({
          id: z.string().uuid(),
          invoice_id: z.string().uuid(),
          invoice_number: z.string(),
          order_id: z.string().uuid(),
          kind: z.string(),
          journal_id: z.string().nullable(),
          attempts: z.number(),
          last_error: z.string().nullable(),
          paid_date: z.string().nullable(),
          gross: z.string().nullable(),
          rounding: z.string().nullable(),
          currency: z.string().nullable(),
          tax_mode: z.string().nullable(),
          refunded: z.string().regex(/^\d+$/).default("0"),
        }),
      )
      .parse(r.data);
  });
export const financeSalesAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("rescan") }),
        z.object({
          action: z.literal("import"),
          id: z.string().uuid(),
          confirmed: z.literal(true),
        }),
      ])
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    if (data.action === "rescan") {
      const r = await client.rpc("finance_sales_rescan");
      if (r.error) throw new Error(r.error.message);
      return { error: null };
    }
    const r = await client.rpc("finance_sales_complete", { p_id: data.id });
    if (r.error) throw new Error(r.error.message);
    return z.object({ error: z.string().nullable() }).parse(r.data);
  });

export const financeSalesOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid() }).parse(x))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_sales_original", {
      p_id: data.id,
    });
    if (r.error) throw new Error(r.error.message);
    return z.object({ number: z.string(), pdf: z.string() }).parse(r.data);
  });

export const financeRefundPay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        event: z.string().uuid(),
        document: z.string().uuid(),
        reference: z.string().trim().min(5).max(200),
        date: z.string().date(),
        amount: z.string().regex(/^[1-9]\d{0,12}$/),
        account: z.string().min(1).max(40),
        confirmed: z.literal(true),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_refund_pay", {
      p_id: data.id,
      p_event: data.event,
      p_document: data.document,
      p_reference: data.reference,
      p_date: data.date,
      p_amount: data.amount,
      p_account: data.account,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
