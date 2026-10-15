import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const date = z.string().date();
const minor = z
  .string()
  .regex(/^\d{1,13}$/)
  .refine((v) => BigInt(v) <= 9000000000000n);
const Account = z.object({
  code: z.string(),
  cash_kind: z.enum(["bank", "cash"]).nullable().optional(),
  name_de: z.string(),
  name_en: z.string(),
  kind: z.enum(["asset", "liability", "equity", "income", "expense"]),
  active: z.boolean(),
});
export const Snapshot = z.object({
  role: z.enum(["owner", "accountant", "staff", "auditor"]),
  accounts: z.array(Account),
  periods: z.array(z.object({ id: date, closed: z.boolean() })),
  journals: z.array(
    z.object({
      id: z.string().uuid(),
      booking_date: date,
      memo: z.string(),
      status: z.enum(["draft", "posted"]),
      source: z.object({ reference: z.string(), kind: z.string().optional() }),
      created_at: z.string(),
      reversal_of: z.string().nullable(),
      lines: z.array(z.object({ account: z.string(), debit: z.string(), credit: z.string() })),
    }),
  ),
  trial: z.array(
    z.object({
      account: z.string(),
      debit: z.string().regex(/^\d+$/),
      credit: z.string().regex(/^\d+$/),
    }),
  ),
  audit: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      event: z.string(),
      reference: z.string(),
      details: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
  ),
});
export type FinanceSnapshot = z.infer<typeof Snapshot>;
export const financeSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({ from: date, to: date })
      .refine((v) => v.from <= v.to)
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const result = await (context.supabase as SupabaseClient).rpc("finance_snapshot", {
      p_from: data.from,
      p_to: data.to,
    });
    if (result.error)
      throw new Error(
        result.error.code === "PGRST202"
          ? "Finance migration must be applied before use."
          : result.error.message,
      );
    return Snapshot.parse(result.data);
  });
const Command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit"),
    key: z.string().uuid(),
    date,
    memo: z.string().trim().min(3).max(1000),
    reference: z.string().trim().min(1).max(500),
    lines: z
      .array(z.object({ account: z.string().min(1), debit: minor, credit: minor }))
      .min(2)
      .max(200),
  }),
  z.object({ action: z.literal("post"), id: z.string().uuid() }),
  z.object({
    action: z.literal("reverse"),
    id: z.string().uuid(),
    date,
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("period"),
    period: date,
    closed: z.boolean(),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("member"),
    user: z.string().uuid(),
    role: z.enum(["accountant", "staff", "auditor"]).nullable(),
  }),
]);
export type FinanceCommand = z.infer<typeof Command>;
export const financeCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => Command.parse(x))
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    let result;
    switch (data.action) {
      case "submit":
        result = await client.rpc("finance_submit", {
          p_key: data.key,
          p_date: data.date,
          p_memo: data.memo,
          p_source: { reference: data.reference, kind: "manual" },
          p_lines: data.lines,
        });
        break;
      case "post":
        result = await client.rpc("finance_post", { p_id: data.id });
        break;
      case "reverse":
        result = await client.rpc("finance_reverse", {
          p_id: data.id,
          p_date: data.date,
          p_reason: data.reason,
        });
        break;
      case "period":
        result = await client.rpc("finance_set_period", {
          p_period: data.period,
          p_closed: data.closed,
          p_reason: data.reason,
        });
        break;
      case "member":
        result = await client.rpc("finance_set_member", { p_user: data.user, p_role: data.role });
        break;
    }
    if (result.error) throw new Error(result.error.message);
    return { id: typeof result.data === "string" ? result.data : null };
  });

export const financeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({ from: date, to: date })
      .refine((v) => v.from <= v.to)
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_report", {
      p_from: data.from,
      p_to: data.to,
    });
    if (r.error)
      throw new Error(
        r.error.code === "PGRST202"
          ? "Apply the finance reports migration before use."
          : r.error.message,
      );
    const { ReportSchema } = await import("./finance/reports");
    return ReportSchema.parse(r.data);
  });
