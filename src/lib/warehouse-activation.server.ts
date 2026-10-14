import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function readQrActivationBlockers(productId: string) {
  // Keep customer details, payment identifiers and checkout secrets out of this response.
  const db = supabaseAdmin as unknown as SupabaseClient;
  const orders = new Map<string, { id: string; number: string; status: string; payment: string }>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("order_items")
      .select("id,order_id,orders!inner(order_number,status,payment_status)")
      .eq("product_id", productId)
      .not("orders.status", "in", "(delivered,cancelled)")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Could not check existing orders. Please retry.");
    for (const row of data ?? []) {
      const order = row.orders as unknown as {
        order_number: string;
        status: string;
        payment_status: string;
      };
      orders.set(row.order_id, {
        id: row.order_id,
        number: order.order_number,
        status: order.status,
        payment: order.payment_status,
      });
    }
    if ((data?.length ?? 0) < 500) break;
  }
  const holds: { id: string; createdAt: string; provider: string | null }[] = [];
  for (let offset = 0; ; offset += 500) {
    // Explicit JSON avoids PostgREST treating a JavaScript array as a PostgreSQL array literal.
    const { data: drafts, error } = await db
      .from("checkout_drafts")
      .select("id")
      .contains("item_data", JSON.stringify([{ product_id: productId }]))
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Could not check payment reservations. Please retry.");
    if (drafts?.length) {
      const { data, error: holdError } = await db
        .from("order_checkouts")
        .select("order_id,created_at,provider_kind")
        .in(
          "order_id",
          drafts.map((d) => d.id),
        )
        .eq("state", "reserved");
      if (holdError) throw new Error("Could not check payment reservations. Please retry.");
      for (const hold of data ?? [])
        holds.push({ id: hold.order_id, createdAt: hold.created_at, provider: hold.provider_kind });
    }
    if ((drafts?.length ?? 0) < 500) break;
  }
  return { orders: [...orders.values()], holds };
}
