import { getCheckout, settleCheckout } from "./checkout.server";
import { getStripeClient } from "./stripe.server";

export async function cancelProviderCheckout(orderId: string, authorize = true) {
  const { checkout, order } = await getCheckout(orderId, authorize);
  if (checkout.state === "released") return { cancelled: true };
  if (checkout.state === "paid") throw new Error("This order is already paid.");
  if (checkout.provider_kind && !checkout.provider_id)
    throw new Error("Payment initialization is incomplete. Retry payment before cancelling.");
  if (checkout.provider_kind === "paypal" && checkout.capture_started)
    throw new Error(
      "Payment confirmation is in progress. Please retry confirmation or contact support.",
    );
  if (checkout.provider_id && checkout.provider_kind?.startsWith("stripe_")) {
    const stripe = getStripeClient();
    if (!stripe) throw new Error("Could not cancel payment");
    if (checkout.provider_kind === "stripe_checkout") {
      const session = await stripe.checkout.sessions.retrieve(checkout.provider_id);
      if (session.status === "complete")
        throw new Error("Payment has already been submitted. Check your confirmation.");
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    } else {
      const intent = await stripe.paymentIntents.retrieve(checkout.provider_id);
      if (intent.status !== "canceled") await stripe.paymentIntents.cancel(intent.id);
    }
  }
  await settleCheckout(order.id, "released", checkout);
  return { cancelled: true };
}
