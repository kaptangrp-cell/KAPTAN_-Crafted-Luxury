import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Use the caller's authenticated client so database RLS is also enforced.
export async function readAccountOrders(client: SupabaseClient<Database>, userId: string) {
  if (!userId) throw new Error("Sign in to view your orders.");
  const { data, error } = await client
    .from("orders")
    .select(
      "id, order_number, status, payment_status, total, created_at, order_items(quantity, product_name)",
    )
    .eq("user_id", userId)
    .in("payment_status", ["paid", "refunded", "partially_refunded"])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your orders. Please try again.");
  return { orders: data ?? [] };
}

export async function readAccountOrder(
  client: SupabaseClient<Database>,
  userId: string,
  orderId: string,
) {
  if (!userId) throw new Error("Sign in to view your orders.");
  const { data, error } = await client
    .from("orders")
    .select("*, order_items(*)")
    .eq("user_id", userId)
    .in("payment_status", ["paid", "refunded", "partially_refunded"])
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) throw new Error("Order not found or access denied.");
  return { order: data };
}
