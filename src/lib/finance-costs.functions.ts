import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ShipmentInput, costShipment } from "./finance/costing";
const uuid = z.string().uuid(),
  integer = z.string().regex(/^-?\d+$/);
export const financeCostsList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ search: z.string().max(200), page: z.number().int().min(0).max(100000) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_cost_list", {
      p_search: data.search,
      p_page: data.page,
    });
    if (r.error)
      throw new Error(
        r.error.code === "PGRST202"
          ? "Apply the inventory costing migration before use."
          : r.error.message,
      );
    return z
      .object({
        units: z.array(
          z.object({
            id: uuid,
            batch_id: uuid,
            state: z.string(),
            variant_id: uuid,
            name: z.string(),
            variant_value: z.string(),
            book_cost: integer.nullable(),
            original_cost: integer.nullable(),
          }),
        ),
        shipments: z.array(
          z.object({
            id: uuid,
            reference: z.string(),
            supplier: z.string(),
            booking_date: z.string(),
            total: integer,
            components: z.array(
              z.object({
                document: uuid,
                reference: z.string(),
                kind: z.string(),
                amount: integer,
                paid: integer,
              }),
            ),
            journal_id: uuid,
          }),
        ),
        events: z.array(
          z.object({
            id: integer,
            unit_id: uuid,
            old_state: z.string().nullable(),
            new_state: z.string(),
            created_at: z.string(),
            last_error: z.string().nullable(),
          }),
        ),
        totals: z.object({
          units: integer,
          uncosted: integer,
          costedValue: integer,
          ledgerValue: integer,
          pending: integer,
        }),
      })
      .parse(r.data);
  });
export const financeCostPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => ShipmentInput.parse(x))
  .handler(async ({ context, data }) => {
    const role = await (context.supabase as SupabaseClient).rpc("finance_role");
    if (role.error || !["owner", "accountant"].includes(role.data)) throw new Error("Forbidden");
    const payload = costShipment(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await (supabaseAdmin as SupabaseClient).rpc("finance_shipment_post", {
      p_actor: context.userId,
      p_data: payload,
    });
    if (r.error) throw new Error(r.error.message);
    return { journal: uuid.parse(r.data) };
  });
export const financeCostProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: integer, confirmed: z.literal(true) }).parse(x))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_stock_process", {
      p_id: data.id,
    });
    if (r.error) throw new Error(r.error.message);
    return z.object({ error: z.string().nullable() }).parse(r.data);
  });

export const financeImportPay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: uuid,
        document: uuid,
        evidence: uuid,
        date: z.string().date(),
        amount: z.string().regex(/^[1-9]\d{0,12}$/),
        account: z.string().min(1).max(40),
        confirmed: z.literal(true),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_import_pay", {
      p_id: data.id,
      p_document: data.document,
      p_evidence: data.evidence,
      p_date: data.date,
      p_amount: data.amount,
      p_account: data.account,
    });
    if (r.error) throw new Error(r.error.message);
    return { journal: uuid.parse(r.data) };
  });
