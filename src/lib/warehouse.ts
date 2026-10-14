import { z } from "zod";
export const warehousePermissions = ["receive", "dispatch", "return", "inspect", "sell"] as const;
export type WarehousePermission = (typeof warehousePermissions)[number];
export const ScanSchema = z.object({
  unit: z.string().uuid(),
  action: z.enum(["receive", "pack", "dispatch", "return", "pass", "reject", "unpack", "sell"]),
  order: z.string().trim().max(100).default(""),
  reason: z.string().trim().max(300).default(""),
  operation: z.string().uuid(),
});
export type ScanInput = z.infer<typeof ScanSchema>;
export function parseUnitCode(value: string) {
  const code = value.trim();
  if (!code.startsWith("KPT:UNIT:1:")) throw new Error("Scan a KAPTAN unit QR label.");
  return z.string().uuid().parse(code.slice(11));
}
export const unitCode = (id: string) => `KPT:UNIT:1:${id}`;
export interface WarehouseAccess {
  admin: boolean;
  permissions: WarehousePermission[];
}
export interface UnitLabel {
  id: string;
  name: string;
  variant: string;
  sku: string;
  location: string;
}
export interface ScanResult {
  id: string;
  name: string;
  variant: string;
  state: string;
  location: string;
}
export interface WarehouseDashboard extends WarehouseAccess {
  counts?: Record<string, number>;
  staff?: { id: string; name: string | null; email: string; permissions: WarehousePermission[] }[];
  products?: {
    id: string;
    name: string;
    managed: boolean;
    stock: number;
    variants: { id: string; name: string; stock: number | null }[];
  }[];
  batches?: { batch_id: string; created_at: string; quantity: number }[];
  labels?: UnitLabel[];
  events?: {
    id: number;
    unit_id: string;
    actor_id: string | null;
    old_state: string | null;
    new_state: string;
    reason: string | null;
    created_at: string;
  }[];
  order?: {
    number: string;
    status: string;
    units: { name: string; variant: string; state: string; location: string }[];
  } | null;
}
export const WarehouseAdminSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("staff"),
    operation: z.string().uuid(),
    data: z.object({
      email: z.string().email(),
      permissions: z.array(z.enum(warehousePermissions)).max(5),
    }),
  }),
  z.object({
    action: z.literal("enable"),
    operation: z.string().uuid(),
    data: z.object({ productId: z.string().uuid() }),
  }),
  z.object({
    action: z.literal("labels"),
    operation: z.string().uuid(),
    data: z.object({
      variantId: z.string().uuid(),
      quantity: z.number().int().min(1).max(200),
      location: z.string().trim().min(1).max(80),
    }),
  }),
]);
