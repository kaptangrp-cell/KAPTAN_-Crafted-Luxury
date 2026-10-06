import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { capturePaypalOrder, getPaypalOrder } from "./paypal.server";
import { verifyPayment, verifyPaypalOrder } from "./verification";

export async function hasManagedCheckout(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("order_checkouts")
    .select("order_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error("Could not check payment binding");
  return Boolean(data);
}

/** Only signed Stripe webhook events can enter this path for pre-migration orders. */
export async function settleLegacyStripe(actual: {
  orderId: string;
  providerId: string;
  amount: number;
  currency: string;
  paid: boolean;
}) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,total,payment_method,status,payment_status")
    .eq("id", actual.orderId)
    .single();
  if (
    error ||
    !order ||
    order.payment_method !== "card" ||
    order.status === "cancelled" ||
    order.payment_status === "refunded"
  )
    throw new Error("Legacy order requires reconciliation");
  verifyPayment(actual, {
    orderId: order.id,
    providerId: actual.providerId,
    total: Number(order.total),
  });
  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", order.id);
  if (updateError) throw new Error("Legacy payment update failed");
}

/** An old guest return has no new cookie. Its saved, unguessable provider ID is the capability.
 * Return only the receipt number; never expose address or other customer data here.
 */
export async function captureLegacyPaypal(orderId: string, paypalOrderId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,order_number,total,admin_notes,payment_method,status,payment_status")
    .eq("id", orderId)
    .single();
  if (
    error ||
    !order ||
    order.payment_method !== "paypal" ||
    order.status === "cancelled" ||
    order.payment_status === "refunded" ||
    !order.admin_notes?.endsWith(`PayPal Order ID: ${paypalOrderId}`)
  )
    throw new Error("PayPal order does not match checkout");
  const expected = {
    providerId: paypalOrderId,
    orderNumber: order.order_number,
    total: Number(order.total),
  };
  const before = await getPaypalOrder(paypalOrderId);
  verifyPaypalOrder(before, expected, before.status === "COMPLETED");
  verifyPaypalOrder(await capturePaypalOrder(paypalOrderId), expected, true);
  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", order.id);
  if (updateError) throw new Error("Payment update failed. Retry confirmation.");
  return { orderId: order.id, orderNumber: order.order_number };
}
