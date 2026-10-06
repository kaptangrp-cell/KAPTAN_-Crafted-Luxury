import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { digest, getCheckout, settleCheckout } from "./checkout.server";
import { getStripeClient } from "./stripe.server";
import { getPaypalOrder } from "./paypal.server";
import { verifyPayment, verifyPaypalOrder } from "./verification";

/** Run hourly. Never release a reservation while provider payment may be in flight. */
export async function reconcileCheckouts(request: Request) {
  const secret = process.env.CHECKOUT_CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  if (
    !secret ||
    !timingSafeEqual(Buffer.from(digest(supplied)), Buffer.from(digest(`Bearer ${secret}`)))
  )
    return new Response("Unauthorized", { status: 401 });
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("order_checkouts")
    .select("order_id")
    .eq("state", "reserved")
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(100);
  if (error) return new Response("Could not read pending checkouts", { status: 503 });
  let settled = 0;
  let needsAttention = 0;
  for (const row of rows ?? []) {
    try {
      const { checkout, order } = await getCheckout(row.order_id, false);
      if (!checkout.provider_kind) {
        await settleCheckout(order.id, "released", checkout);
        settled++;
        continue;
      }
      // Provider creation may have succeeded before its ID could be persisted. Do not guess.
      if (!checkout.provider_id) {
        needsAttention++;
        continue;
      }
      if (checkout.provider_kind === "paypal") {
        const paypal = await getPaypalOrder(checkout.provider_id);
        if (paypal.status === "COMPLETED") {
          verifyPaypalOrder(
            paypal,
            {
              providerId: checkout.provider_id,
              orderNumber: order.order_number,
              total: Number(order.total),
            },
            true,
          );
          await settleCheckout(order.id, "paid");
        } else if (!checkout.capture_started) {
          // All captures pass through our guarded server endpoint, so releasing disables capture.
          await settleCheckout(order.id, "released", checkout);
        } else {
          needsAttention++;
          continue;
        }
      } else {
        const stripe = getStripeClient();
        if (!stripe) throw new Error("Stripe unavailable");
        if (checkout.provider_kind === "stripe_checkout") {
          const session = await stripe.checkout.sessions.retrieve(checkout.provider_id);
          if (session.payment_status === "paid") {
            verifyPayment(
              {
                providerId: session.id,
                orderId: session.metadata?.orderId,
                amount: session.amount_total ?? -1,
                currency: session.currency ?? "",
                paid: true,
              },
              { providerId: checkout.provider_id, orderId: order.id, total: Number(order.total) },
            );
            await settleCheckout(order.id, "paid");
          } else if (session.status === "open" || session.status === "expired") {
            if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
            await settleCheckout(order.id, "released", checkout);
          } else {
            needsAttention++;
            continue;
          }
        } else {
          const intent = await stripe.paymentIntents.retrieve(checkout.provider_id);
          if (intent.status === "succeeded") {
            verifyPayment(
              {
                providerId: intent.id,
                orderId: intent.metadata.orderId,
                amount: intent.amount_received,
                currency: intent.currency,
                paid: true,
              },
              { providerId: checkout.provider_id, orderId: order.id, total: Number(order.total) },
            );
            await settleCheckout(order.id, "paid");
          } else if (
            [
              "requires_payment_method",
              "requires_confirmation",
              "requires_action",
              "canceled",
            ].includes(intent.status)
          ) {
            if (intent.status !== "canceled") await stripe.paymentIntents.cancel(intent.id);
            await settleCheckout(order.id, "released", checkout);
          } else {
            needsAttention++;
            continue;
          }
        }
      }
      settled++;
    } catch (err) {
      console.error("[checkout-reconciliation]", row.order_id, err);
      needsAttention++;
    }
  }
  return Response.json({ settled, needsAttention }, { status: needsAttention ? 503 : 200 });
}
