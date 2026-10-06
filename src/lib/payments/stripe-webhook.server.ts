import { hasManagedCheckout, settleLegacyStripe } from "./legacy.server";
import type Stripe from "stripe";
import { getStripeClient } from "./stripe.server";
import { getCheckout, settleCheckout } from "./checkout.server";
import { verifyPayment } from "./verification";

export async function handleStripeWebhook(request: Request): Promise<Response> {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.expired",
        "checkout.session.async_payment_failed",
      ].includes(event.type)
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) return Response.json({ received: true }); // Unrelated integration.
      if (!(await hasManagedCheckout(orderId))) {
        if (session.payment_status === "paid")
          await settleLegacyStripe({
            orderId,
            providerId: session.id,
            amount: session.amount_total ?? -1,
            currency: session.currency ?? "",
            paid: true,
          });
        return Response.json({ received: true });
      }
      const { order, checkout } = await getCheckout(orderId, false);
      if (checkout.provider_kind !== "stripe_checkout" || checkout.provider_id !== session.id)
        throw new Error("Checkout binding not yet available");
      if (session.payment_status === "paid") {
        verifyPayment(
          {
            providerId: session.id,
            orderId,
            amount: session.amount_total ?? -1,
            currency: session.currency ?? "",
            paid: true,
          },
          { providerId: checkout.provider_id, orderId, total: Number(order.total) },
        );
        await settleCheckout(orderId, "paid");
      } else if (
        (event.type === "checkout.session.expired" ||
          event.type === "checkout.session.async_payment_failed") &&
        checkout.state !== "paid"
      ) {
        await settleCheckout(orderId, "released", checkout);
      }
    } else if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        if (!(await hasManagedCheckout(orderId))) {
          await settleLegacyStripe({
            orderId,
            providerId: intent.id,
            amount: intent.amount_received,
            currency: intent.currency,
            paid: intent.status === "succeeded",
          });
          return Response.json({ received: true });
        }
        const { order, checkout } = await getCheckout(orderId, false);
        // Hosted Checkout also emits this event; its session event owns settlement.
        if (checkout.provider_kind === "stripe_intent") {
          verifyPayment(
            {
              providerId: intent.id,
              orderId,
              amount: intent.amount_received,
              currency: intent.currency,
              paid: true,
            },
            { providerId: checkout.provider_id ?? "", orderId, total: Number(order.total) },
          );
          await settleCheckout(orderId, "paid");
        }
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] Retryable processing failure", error);
    return new Response("Payment update failed; retry required", { status: 500 });
  }
}
