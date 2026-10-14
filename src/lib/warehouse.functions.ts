import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ScanSchema,
  WarehouseAdminSchema,
  type WarehouseAccess,
  type WarehouseDashboard,
  type ScanResult,
  type UnitLabel,
} from "./warehouse";

// New RPCs are typed here until Supabase's generated schema is refreshed after migration.
async function rpc<T>(
  client: unknown,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await (client as SupabaseClient).rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new Error(
        "Warehouse setup is not installed. Apply the QR warehouse database migration first.",
      );
    throw new Error(error.message);
  }
  return data as T;
}
export const getWarehouseAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => rpc<WarehouseAccess>(context.supabase, "warehouse_access"));
export const getWarehouseDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        admin: z.boolean().default(false),
        order: z.string().max(100).optional(),
        batch: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(({ context, data }) =>
    rpc<WarehouseDashboard>(context.supabase, "warehouse_dashboard", {
      p_admin: data.admin,
      p_order: data.order ?? null,
      p_batch: data.batch ?? null,
    }),
  );
export const manageWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WarehouseAdminSchema.parse(input))
  .handler(({ context, data }) =>
    rpc<UnitLabel[] | { saved?: boolean; enabled?: boolean }>(context.supabase, "warehouse_admin", {
      p_action: data.action,
      p_data: data.data,
      p_operation: data.operation,
    }),
  );
export const scanWarehouseUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanSchema.parse(input))
  .handler(({ context, data }) =>
    rpc<ScanResult>(context.supabase, "warehouse_scan", {
      p_unit: data.unit,
      p_action: data.action,
      p_order: data.order,
      p_reason: data.reason,
      p_operation: data.operation,
    }),
  );

/** Read-only explanation of the same blockers checked atomically by warehouse_admin. */
export const getQrActivationBlockers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .single();
    if (profileError || profile?.role !== "admin") throw new Error("Forbidden");
    const { readQrActivationBlockers } = await import("./warehouse-activation.server");
    return readQrActivationBlockers(data.productId);
  });
