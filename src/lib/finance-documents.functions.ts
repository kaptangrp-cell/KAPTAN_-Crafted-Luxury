import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const Doc = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mime: z.string(),
  bytes: z.number(),
  sha256: z.string(),
  state: z.enum(["uploading", "ready"]),
  created_at: z.string(),
});
const Expense = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  supplier: z.string(),
  invoice_number: z.string(),
  invoice_date: z.string(),
  description: z.string(),
  gross: z.string(),
  journal_id: z.string().nullable(),
  replaces: z.string().nullable(),
  reversed: z.boolean(),
  superseded: z.boolean(),
  paid: z.string(),
});
export type FinanceDocument = z.infer<typeof Doc>;
export type FinanceExpense = z.infer<typeof Expense>;
export const listFinanceDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ search: z.string().max(200), page: z.number().int().min(0).max(100000) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_documents_list", {
      p_search: data.search,
      p_page: data.page,
    });
    if (r.error)
      throw new Error(
        r.error.code === "PGRST202"
          ? "Apply the documents and expenses migration before use."
          : r.error.message,
      );
    return z.object({ documents: z.array(Doc), expenses: z.array(Expense) }).parse(r.data);
  });
export const uploadFinanceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ name: z.string().trim().min(1).max(200), base64: z.string().max(4194304) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    const role = await client.rpc("finance_role");
    if (role.error || !["owner", "accountant", "staff"].includes(role.data))
      throw new Error("Forbidden");
    const { inspectDocument } = await import("./finance/documents.server");
    const file = inspectDocument(data.base64);
    const reserved = await client.rpc("finance_document_reserve", {
      p_hash: file.hash,
      p_name: Array.from(data.name, (c) =>
        c.charCodeAt(0) < 32 || c === "/" || c === "\\" ? "_" : c,
      ).join(""),
      p_mime: file.mime,
      p_bytes: file.bytes.length,
    });
    if (reserved.error) throw new Error(reserved.error.message);
    const doc = Doc.parse(reserved.data);
    if (doc.state === "ready") return { id: doc.id, duplicate: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storage = supabaseAdmin.storage.from("finance-originals");
    // Immutable content-addressed key. A failed completion can retry without overwrite.
    const put = await storage.upload(file.hash, file.bytes, {
      contentType: file.mime,
      upsert: false,
    });
    if (put.error) {
      const old = await storage.download(file.hash);
      if (old.error || !old.data)
        throw new Error("Original upload failed. Please retry the same file.");
      const existing = inspectDocument(
        Buffer.from(await old.data.arrayBuffer()).toString("base64"),
      );
      if (existing.hash !== file.hash) throw new Error("Stored original fingerprint mismatch");
    }
    const done = await (supabaseAdmin as SupabaseClient).rpc("finance_document_finish", {
      p_id: doc.id,
      p_actor: context.userId,
    });
    if (done.error)
      throw new Error("Original stored; metadata completion failed. Retry the same file.");
    return { id: doc.id, duplicate: false };
  });
export const readFinanceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid() }).parse(x))
  .handler(async ({ context, data }) => {
    const access = await (context.supabase as SupabaseClient).rpc("finance_document_access", {
      p_id: data.id,
    });
    if (access.error) throw new Error(access.error.message);
    const doc = Doc.parse(access.data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const file = await supabaseAdmin.storage.from("finance-originals").download(doc.sha256);
    if (file.error || !file.data) throw new Error("Original unavailable; contact the owner");
    const { inspectDocument } = await import("./finance/documents.server");
    const base64 = Buffer.from(await file.data.arrayBuffer()).toString("base64");
    if (inspectDocument(base64).hash !== doc.sha256)
      throw new Error("Original fingerprint mismatch");
    return { document: doc, base64 };
  });
const amount = z
  .string()
  .regex(/^[0-9]{1,13}$/)
  .refine((v) => BigInt(v) > 0n && BigInt(v) <= 9000000000000n);
const Command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("draft"),
    id: z.string().uuid(),
    document: z.string().uuid(),
    supplier: z.string().trim().min(2).max(200),
    number: z.string().trim().min(1).max(200),
    date: z.string().date(),
    description: z.string().trim().min(3).max(1000),
    gross: amount,
    replaces: z.string().uuid().nullable(),
    confirmed: z.literal(true),
  }),
  z.object({ action: z.literal("post"), id: z.string().uuid() }),
  z.object({
    action: z.literal("payment"),
    id: z.string().uuid(),
    expense: z.string().uuid(),
    document: z.string().uuid(),
    date: z.string().date(),
    amount,
    account: z.enum(["BANK", "CASH"]),
    confirmed: z.literal(true),
  }),
]);
export type ExpenseCommand = z.infer<typeof Command>;
export const financeExpenseCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => Command.parse(x))
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    let r;
    if (data.action === "draft")
      r = await client.rpc("finance_expense_draft", {
        p_id: data.id,
        p_document: data.document,
        p_supplier: data.supplier,
        p_number: data.number,
        p_date: data.date,
        p_description: data.description,
        p_gross: data.gross,
        p_replaces: data.replaces,
      });
    else if (data.action === "post")
      r = await client.rpc("finance_expense_post", { p_id: data.id });
    else
      r = await client.rpc("finance_expense_pay", {
        p_id: data.id,
        p_expense: data.expense,
        p_document: data.document,
        p_date: data.date,
        p_amount: data.amount,
        p_account: data.account,
      });
    if (r.error)
      throw new Error(
        r.error.code === "23505"
          ? "An invoice with this supplier/number or original is already posted."
          : r.error.message,
      );
    return { id: z.string().uuid().parse(r.data) };
  });
