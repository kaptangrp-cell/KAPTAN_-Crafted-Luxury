import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid(),
  date = z.string().date();
export const financeAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ through: date }).parse(v))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_assets_list", {
      p_through: data.through,
    });
    if (r.error) throw new Error(r.error.message);
    return z
      .array(
        z.object({
          id: uuid,
          name: z.string(),
          document_id: uuid,
          journal_id: uuid,
          start_date: date,
          months: z.number(),
          basis: z.string(),
          cost: z.string(),
          depreciated: z.string(),
          book_value: z.string(),
          proposed: z.string(),
          last_date: z.string().nullable(),
        }),
      )
      .parse(r.data);
  });
export const financeAssetSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("register"),
          id: uuid,
          document: uuid,
          journal: uuid,
          name: z.string().trim().min(3).max(200),
          start: date,
          months: z.number().int().min(1).max(1200),
          basis: z.string().trim().min(10).max(1000),
        }),
        z.object({ action: z.literal("depreciate"), id: uuid, through: date }),
      ])
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const c = context.supabase as SupabaseClient;
    const r =
      data.action === "register"
        ? await c.rpc("finance_asset_register", {
            p_id: data.id,
            p_document: data.document,
            p_journal: data.journal,
            p_name: data.name,
            p_start: data.start,
            p_months: data.months,
            p_basis: data.basis,
          })
        : await c.rpc("finance_asset_depreciate", { p_id: data.id, p_through: data.through });
    if (r.error) throw new Error(r.error.message);
    return { id: uuid.parse(r.data) };
  });
