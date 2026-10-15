import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid();
export const SupplierSchema = z.object({
  id: uuid,
  name: z.string(),
  country: z.string(),
  tax_id: z.string(),
  email: z.string(),
  address: z.string(),
  active: z.boolean(),
  revision: z.number().int(),
  updated_at: z.string(),
});
export type Supplier = z.infer<typeof SupplierSchema>;
export const financeAdministration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ search: z.string().max(200) }).parse(x))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_administration", {
      p_search: data.search,
    });
    if (r.error) throw new Error(r.error.message);
    return z
      .object({
        suppliers: z.array(SupplierSchema),
        years: z.array(z.object({ year: z.number(), months: z.number(), closed: z.number() })),
      })
      .parse(r.data);
  });
export const financeAdministrationSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("supplier"),
          id: uuid,
          revision: z.number().int().min(0),
          name: z.string().trim().min(2).max(200),
          country: z.string().regex(/^[A-Z]{2}$/),
          taxId: z.string().max(80),
          email: z.union([z.literal(""), z.string().email().max(254)]),
          address: z.string().max(1000),
          active: z.boolean(),
        }),
        z.object({
          action: z.literal("year"),
          year: z.number().int().min(2026).max(2100),
          reason: z.string().trim().min(10).max(1000),
        }),
        z.object({
          action: z.literal("retention"),
          document: uuid,
          revision: z.number().int().min(0),
          recordClass: z.enum([
            "unclassified",
            "accounting_book",
            "accounting_voucher",
            "correspondence",
          ]),
          until: z.string().date(),
          hold: z.boolean(),
          reason: z.string().trim().min(10).max(1000),
        }),
      ])
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    let r;
    if (data.action === "supplier")
      r = await client.rpc("finance_supplier_save", {
        p_id: data.id,
        p_revision: data.revision,
        p_name: data.name,
        p_country: data.country,
        p_tax_id: data.taxId,
        p_email: data.email,
        p_address: data.address,
        p_active: data.active,
      });
    else if (data.action === "year")
      r = await client.rpc("finance_create_year", { p_year: data.year, p_reason: data.reason });
    else
      r = await client.rpc("finance_retention_save", {
        p_document: data.document,
        p_revision: data.revision,
        p_class: data.recordClass,
        p_until: data.until,
        p_hold: data.hold,
        p_reason: data.reason,
      });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
