import { createHash, randomBytes } from "node:crypto";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE = "kaptan_checkout";
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function checkoutOwner(create = false) {
  let token = getCookie(COOKIE);
  if (!token && create) {
    token = randomBytes(32).toString("hex");
    setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(getRequest().url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Please reopen checkout in the browser used to place this order.");
  return digest(token);
}

export async function authenticatedUserId() {
  const auth = getRequest().headers.get("authorization");
  if (!auth) return null;
  if (!auth.startsWith("Bearer ")) throw new Error("Invalid authentication");
  const { data, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Your sign-in expired. Please sign in again.");
  return data.user.id;
}

export function checkoutOrigin() {
  const configured = process.env.PUBLIC_SITE_URL;
  const request = new URL(getRequest().url);
  const origin = configured ? new URL(configured).origin : request.origin;
  if (!configured && !["localhost", "127.0.0.1", "[::1]"].includes(request.hostname)) {
    throw new Error("Checkout is not configured. Please contact support.");
  }
  if (
    configured &&
    new URL(configured).protocol !== "https:" &&
    process.env.NODE_ENV === "production"
  )
    throw new Error("Checkout requires HTTPS");
  return origin;
}

export async function getCheckout(orderId: string, authorize = true) {
  const { data: checkout, error } = await supabaseAdmin
    .from("order_checkouts")
    .select("*")
    .eq("order_id", orderId)
    .single();
  if (error || !checkout) throw new Error("Checkout not found");
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();
  if (orderError || !order) throw new Error("Order not found");
  if (authorize) {
    let guestAllowed = false;
    try {
      guestAllowed = checkout.owner_hash === checkoutOwner();
    } catch {
      /* Owner auth may still succeed. */
    }
    if (!guestAllowed && (!order.user_id || (await authenticatedUserId()) !== order.user_id))
      throw new Error("Order access denied");
  }
  return { checkout, order };
}

export async function claimProvider(
  orderId: string,
  kind: "stripe_checkout" | "stripe_intent" | "paypal",
) {
  const { checkout, order } = await getCheckout(orderId);
  if (
    checkout.state !== "reserved" ||
    order.payment_status === "paid" ||
    order.status === "cancelled"
  )
    throw new Error("This checkout is no longer payable");
  if ((kind === "paypal") !== (order.payment_method === "paypal"))
    throw new Error("Payment method does not match order");
  const { error } = await supabaseAdmin
    .from("order_checkouts")
    .update({ provider_kind: kind })
    .eq("order_id", orderId)
    .eq("state", "reserved")
    .is("provider_kind", null);
  if (error) throw new Error("Could not prepare payment");
  const current = await getCheckout(orderId);
  if (current.checkout.provider_kind !== kind || current.checkout.state !== "reserved")
    throw new Error("Another payment is already in progress");
  return current;
}

export async function bindProvider(orderId: string, providerId: string, url?: string | null) {
  const { data, error } = await supabaseAdmin
    .from("order_checkouts")
    .update({ provider_id: providerId, redirect_url: url ?? null })
    .eq("order_id", orderId)
    .eq("state", "reserved")
    .select("order_id")
    .single();
  if (error || !data)
    throw new Error(
      "Payment was created but could not be saved. Retry this checkout; do not place a new order.",
    );
}

export async function settleCheckout(
  orderId: string,
  state: "paid" | "released",
  expected?: { provider_id: string | null; provider_kind: string | null },
) {
  const { error } = await supabaseAdmin.rpc("settle_checkout_order", {
    p_order_id: orderId,
    p_state: state,
    p_provider_id: expected?.provider_id ?? null,
    p_provider_kind: expected?.provider_kind ?? null,
  });
  if (error) throw new Error("Order update failed. Please retry.");
}
