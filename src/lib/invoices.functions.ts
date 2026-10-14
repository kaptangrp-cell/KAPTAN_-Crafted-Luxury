import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Invoice } from "./invoices/model";
export type InvoiceRow = {
  id: string;
  number: string;
  kind: Invoice["kind"];
  order_id: string;
  state: string;
  created_at: string;
  issue_date: string | null;
  error: string | null;
  model: Invoice | null;
  invoice_delivery: {
    state: string;
    error: string | null;
    sent_at: string | null;
    portal_submitted_at: string | null;
    portal_reference: string | null;
  } | null;
};
const Filter = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  productId: z.string().uuid().optional(),
  kind: z.enum(["advance", "final", "credit"]).optional(),
  page: z.number().int().min(0).default(0),
});
async function admin(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("profiles").select("role").eq("id", userId).single();
  if (error || data?.role !== "admin") throw new Error("Forbidden");
}
export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => Filter.parse(x))
  .handler(async ({ context, data }) => {
    await admin(context.supabase, context.userId);
    let q = (context.supabase as SupabaseClient)
      .from("invoices")
      .select(
        "id,number,kind,order_id,state,created_at,issue_date,error,model,invoice_delivery(state,error,sent_at,portal_submitted_at,portal_reference)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(data.page * 50, data.page * 50 + 49);
    if (data.from) q = q.gte("issue_date", data.from);
    if (data.to) q = q.lte("issue_date", data.to);
    if (data.productId) q = q.contains("source", { items: [{ product_id: data.productId }] });
    if (data.kind) q = q.eq("kind", data.kind);
    const result = await q;
    if (result.error)
      throw new Error("Invoice archive unavailable. Apply the invoice migrations before use.");
    return { rows: result.data as unknown as InvoiceRow[], count: result.count ?? 0 };
  });
export const invoiceProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await admin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as SupabaseClient).rpc("invoice_products");
    if (error) throw new Error(error.message);
    return data as { id: string; name: string }[];
  });
export const invoiceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["retry", "portal_submitted", "final", "credit"]),
        details: z
          .object({
            supplyDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            reason: z.string().max(500).optional(),
            reference: z.string().max(200).optional(),
          })
          .default({}),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    await admin(context.supabase, context.userId);
    const result = await (context.supabase as SupabaseClient).rpc("invoice_admin_action", {
      p_id: data.id,
      p_action: data.action,
      p_data: data.details,
    });
    if (result.error) throw new Error(result.error.message);
    return { saved: true };
  });
export const downloadInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ id: z.string().uuid(), format: z.enum(["pdf", "xml", "validation"]) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    await admin(context.supabase, context.userId);
    const { data: row, error } = await (context.supabase as SupabaseClient)
      .from("invoices")
      .select("number,state,xml,pdf_base64,validation")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Invoice unavailable");
    if (data.format === "validation") {
      if (!row.validation?.report) throw new Error("No validation report yet");
      return {
        name: row.number + "-validation.xml",
        base64: Buffer.from(row.validation.report).toString("base64"),
        mime: "application/xml",
      };
    }
    if (row.state !== "issued")
      throw new Error("Only validated, issued invoices can be downloaded");
    return {
      name: row.number + "." + data.format,
      base64: data.format === "pdf" ? row.pdf_base64 : Buffer.from(row.xml).toString("base64"),
      mime: data.format === "pdf" ? "application/pdf" : "application/xml",
    };
  });
