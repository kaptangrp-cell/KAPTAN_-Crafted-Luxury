import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BankMapping, parseCsv, mapBankCsv } from "./finance/bank-csv";
const uuid = z.string().uuid(),
  minor = z.string().regex(/^-?\d{1,13}$/),
  date = z.string().date();
const Snapshot = z.object({
  accounts: z.array(
    z.object({ id: uuid, name: z.string(), ledger_account: z.string(), created_at: z.string() }),
  ),
  statements: z.array(
    z.object({
      id: uuid,
      document_id: uuid,
      start_date: date,
      end_date: date,
      opening: minor,
      closing: minor,
      line_count: z.number(),
      matched_count: z.number(),
      book_opening: z.string(),
      book_closing: z.string(),
      continuity: z.boolean().nullable(),
    }),
  ),
  lines: z.array(
    z.object({
      id: uuid,
      line_no: z.number(),
      booking_date: date,
      amount: minor,
      reference: z.string(),
      transaction_id: z.string().nullable(),
      fee: minor.nullable(),
      gross: minor.nullable(),
      match_id: uuid.nullable(),
      journal_id: uuid.nullable(),
      candidates: z.array(z.object({ id: uuid, booking_date: date, memo: z.string() })),
    }),
  ),
});
export const financeBankList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        account: uuid.nullable(),
        statement: uuid.nullable(),
        page: z.number().int().min(0).max(100000),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_bank_list", {
      p_account: data.account,
      p_statement: data.statement,
      p_page: data.page,
    });
    if (r.error)
      throw new Error(
        r.error.code === "PGRST202" ? "Apply the banking migration before use." : r.error.message,
      );
    return Snapshot.parse(r.data);
  });
export const financeBankPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ document: uuid, delimiter: z.enum([";", ",", "\t"]) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    const { bankOriginal } = await import("./finance/bank-original.server");
    const parsed = parseCsv(await bankOriginal(context.supabase, data.document), data.delimiter);
    return { headers: parsed.headers, sample: parsed.rows.slice(0, 5), count: parsed.rows.length };
  });
export const financeBankImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        document: uuid,
        account: uuid,
        from: date,
        to: date,
        opening: minor,
        closing: minor,
        mapping: BankMapping,
        confirmed: z.literal(true),
      })
      .refine((v) => v.from <= v.to)
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient,
      role = await client.rpc("finance_role");
    if (role.error || !["owner", "accountant", "staff"].includes(role.data))
      throw new Error("Forbidden");
    const { bankOriginal } = await import("./finance/bank-original.server");
    const rows = mapBankCsv(await bankOriginal(client, data.document), data.mapping);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await (supabaseAdmin as SupabaseClient).rpc("finance_bank_import", {
      p_actor: context.userId,
      p_account: data.account,
      p_document: data.document,
      p_start: data.from,
      p_end: data.to,
      p_opening: data.opening,
      p_closing: data.closing,
      p_data: { mapping: data.mapping, rows },
    });
    if (r.error)
      throw new Error(
        r.error.code === "23505"
          ? "Duplicate bank transaction ID; no statement rows were imported."
          : r.error.message,
      );
    return { id: uuid.parse(r.data) };
  });
const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account"), name: z.string().trim().min(2).max(100) }),
  z.object({
    action: z.literal("match"),
    line: uuid,
    journal: uuid,
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({ action: z.literal("release"), id: uuid, reason: z.string().trim().min(5).max(1000) }),
  z.object({
    action: z.literal("classify"),
    line: uuid,
    kind: z.enum(["contribution", "withdrawal", "payout", "bank_fee"]),
    reason: z.string().trim().min(5).max(1000),
    confirmed: z.literal(true),
  }),
]);
export type BankCommand = z.infer<typeof Command>;
export const financeBankCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => Command.parse(x))
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    let r;
    switch (data.action) {
      case "account":
        r = await client.rpc("finance_bank_account", { p_name: data.name });
        break;
      case "match":
        r = await client.rpc("finance_bank_match", {
          p_line: data.line,
          p_journal: data.journal,
          p_reason: data.reason,
        });
        break;
      case "release":
        r = await client.rpc("finance_bank_release", { p_match: data.id, p_reason: data.reason });
        break;
      case "classify":
        r = await client.rpc("finance_bank_classify", {
          p_line: data.line,
          p_action: data.kind,
          p_reason: data.reason,
        });
        break;
    }
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
