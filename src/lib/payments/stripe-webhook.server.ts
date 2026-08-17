import { getStripeClient } from "./stripe.server";

/**
 * Handles POST /webhooks/stripe — verifies the event signature, then marks
 * the matching order as paid on checkout.session.completed. This is what
 * closes the gap the redirect-based "Card" checkout flow has on its own:
 * createStripeCheckoutSession only starts the payment, it never confirms
 * one happened. Stripe calling this endpoint after a successful payment is
 * the actual source of truth.
 *
 * The Express Checkout (Apple Pay / Google Pay) flow doesn't depend on
 * this — it already confirms payment server-side via
 * confirmStripeOrderPayment right after the PaymentIntent succeeds.
 *
 * Wired in from src/server.ts, ahead of the TanStack Start handler, so it
 * gets the raw request body Stripe's signature check requires (TanStack's
 * server functions are RPC calls from our own client, not a fit for a
 * webhook Stripe calls directly).
 */
export async function handleStripeWebhook(request: Request): Promise<Response> {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.error("[stripe-webhook] Received event but Stripe isn't fully configured");
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata?: { orderId?: string } | null };
      const orderId = session.metadata?.orderId;

      if (orderId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("orders")
          .update({ payment_status: "paid" })
          .eq("id", orderId);

        if (error) {
          console.error("[stripe-webhook] Failed to mark order paid:", orderId, error.message);
        }
      } else {
        console.error("[stripe-webhook] checkout.session.completed with no orderId in metadata");
      }
    }
  } catch (err) {
    // Stripe retries on non-2xx, but a bug in our own handling shouldn't
    // cause endless retries of an event we can't process anyway — log and
    // acknowledge instead.
    console.error("[stripe-webhook] Error while processing event:", err);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
