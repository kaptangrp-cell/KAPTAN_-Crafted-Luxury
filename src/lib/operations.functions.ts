import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UnitLabel } from "./warehouse";
async function rpc<T>(
  client: unknown,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await (client as SupabaseClient).rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Install the unit operations migration before use."
        : error.message,
    );
  return data as T;
}
export interface TracedUnit {
  id: string;
  unit_number: string;
  name: string;
  variant: string;
  state: string;
  location: string;
  price: string;
  purchase?: { reference: string; supplier: string; date: string; document: string } | null;
  events: {
    at: string;
    from: string | null;
    to: string;
    actor: string;
    reason: string | null;
    order: string | null;
    location: string | null;
  }[];
}
export interface Purchase {
  id: string;
  supplier: string;
  reference: string;
  ordered_on: string;
  document_id: string;
  lines: {
    id: string;
    name: string;
    variant: string;
    quantity: number;
    labelled: number;
    received: number;
  }[];
  documents: { id: string; filename: string; kind: string }[];
}
export const lookupUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ code: z.string().trim().min(1).max(100) }).parse(x))
  .handler(({ context, data }) =>
    rpc<TracedUnit>(context.supabase, "operations_unit", { p_code: data.code }),
  );
export const listPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => rpc<{ purchases: Purchase[] }>(context.supabase, "operations_list"));
export const savePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        supplier: z.string().trim().min(1).max(200),
        reference: z.string().trim().min(1).max(100),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        document: z.string().uuid(),
        lines: z
          .array(
            z.object({ variant: z.string().uuid(), quantity: z.number().int().min(1).max(10000) }),
          )
          .min(1)
          .max(100),
      })
      .parse(x),
  )
  .handler(({ context, data: { id, ...data } }) =>
    rpc<string>(context.supabase, "operations_purchase", { p_id: id, p_data: data }),
  );
export const purchaseLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        operation: z.string().uuid(),
        line: z.string().uuid(),
        quantity: z.number().int().min(1).max(200),
        location: z.string().trim().min(1).max(80),
      })
      .parse(x),
  )
  .handler(({ context, data }) =>
    rpc<UnitLabel[]>(context.supabase, "operations_labels", {
      p_operation: data.operation,
      p_line: data.line,
      p_quantity: data.quantity,
      p_location: data.location,
    }),
  );
export const attachPurchaseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        purchase: z.string().uuid(),
        document: z.string().uuid(),
        kind: z.enum(["advance", "invoice", "payment"]),
      })
      .parse(x),
  )
  .handler(({ context, data }) =>
    rpc<string>(context.supabase, "operations_purchase_document", {
      p_id: data.id,
      p_purchase: data.purchase,
      p_document: data.document,
      p_kind: data.kind,
    }),
  );
export const moveUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        operation: z.string().uuid(),
        unit: z.string().uuid(),
        location: z.string().trim().min(1).max(80),
      })
      .parse(x),
  )
  .handler(({ context, data }) =>
    rpc<{ id: string; location: string }>(context.supabase, "operations_move", {
      p_operation: data.operation,
      p_unit: data.unit,
      p_location: data.location,
    }),
  );
export const saveFestivalBasket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        event: z.string().trim().min(1).max(120),
        units: z.array(z.string().uuid()).min(1).max(100),
      })
      .parse(x),
  )
  .handler(({ context, data }) =>
    rpc<{ id: string; event: string; seller: string; total: string; items: TracedUnit[] }>(
      context.supabase,
      "festival_basket",
      { p_id: data.id, p_event: data.event, p_units: data.units },
    ),
  );
export const listFestivalBaskets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) =>
    rpc<{ id: string; event: string; created_at: string; snapshot: { items: TracedUnit[] } }[]>(
      context.supabase,
      "festival_baskets_list",
    ),
  );
