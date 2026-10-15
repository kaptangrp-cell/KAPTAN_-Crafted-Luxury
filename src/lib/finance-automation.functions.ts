import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const financeAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .union([
        z.object({ action: z.literal("read") }),
        z.object({
          action: z.literal("save"),
          sales: z.boolean(),
          stock: z.boolean(),
          confirmed: z.literal(true),
        }),
      ])
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc(
      "finance_automation_settings",
      data.action === "save" ? { p_sales: data.sales, p_stock: data.stock } : {},
    );
    if (r.error) throw new Error(r.error.message);
    return z
      .object({
        sales: z.boolean(),
        stock: z.boolean(),
        authorized_by: z.string().uuid().nullable(),
        enabled_from: z.string(),
      })
      .parse(r.data);
  });
