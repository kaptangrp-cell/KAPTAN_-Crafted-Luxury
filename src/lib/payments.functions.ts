import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getStripeClient } from "@/lib/payments/stripe.server";
import {
  createPaypalOrder,
  capturePaypalOrder,
  getPaypalOrder,
  isPaypalConfigured,
} from "@/lib/payments/paypal.server";
import {
  bindProvider,
  checkoutOrigin,
  checkoutOwner,
  claimProvider,
  getCheckout,
  settleCheckout,
} from "@/lib/payments/checkout.server";
import { cents, verifyPayment, verifyPaypalOrder } from "@/lib/payments/verification";

const OrderInput = z.object({ orderId: z.string().uuid() });

export const getPaymentAvailability = createServerFn({ method: "POST" }).handler(async () => {
  checkoutOwner(true);
  let ready = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL);
  try {
    checkoutOrigin();
  } catch {
    ready = false;
  }
  if (ready) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("checkout_drafts").select("id").limit(0);
    if (error) ready = false;
  }
  return {
    card: ready && Boolean(getStripeClient() && process.env.STRIPE_WEBHOOK_SECRET),
    paypal: ready && isPaypalConfigured(),
  };
});

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => {
    const stripe = getStripeClient();
    if (!stripe) throw new Error("Card payments are unavailable.");
    const { order, checkout } = await claimProvider(data.orderId, "stripe_checkout");
    if (checkout.provider_id) {
      const existing = await stripe.checkout.sessions.retrieve(checkout.provider_id);
      if (existing.status !== "open" || !existing.url)
        throw new Error("This payment session has ended. Check your order status.");
      return { url: existing.url };
    }
    if (Date.now() - new Date(checkout.created_at).getTime() > 25 * 60 * 1000)
      throw new Error("Payment initialization expired. Please contact support before retrying.");
    const origin = checkoutOrigin();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: order.customer_email,
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: cents(order.total),
              product_data: {
                name: `KAPTAN ${order.order_number}`,
                description: "Order total including shipping",
              },
            },
            quantity: 1,
          },
        ],
        metadata: { orderId: order.id, orderNumber: order.order_number },
        payment_intent_data: { metadata: { orderId: order.id } },
        expires_at: Math.floor(new Date(checkout.created_at).getTime() / 1000) + 3600,
        success_url: `${origin}/checkout/complete?orderId=${order.id}`,
        cancel_url: `${origin}/checkout?cancelOrderId=${order.id}`,
      },
      { idempotencyKey: `checkout-${order.id}` },
    );
    if (!session.url) throw new Error("Could not start card checkout");
    await bindProvider(order.id, session.id, session.url);
    return { url: session.url };
  });

export const createPaypalCheckoutOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => {
    if (!isPaypalConfigured()) throw new Error("PayPal is unavailable.");
    const { order, checkout } = await claimProvider(data.orderId, "paypal");
    if (checkout.provider_id && checkout.redirect_url)
      return { url: checkout.redirect_url, paypalOrderId: checkout.provider_id };
    if (Date.now() - new Date(checkout.created_at).getTime() > 25 * 60 * 1000)
      throw new Error("Payment initialization expired. Please contact support before retrying.");
    const origin = checkoutOrigin();
    const result = await createPaypalOrder({
      orderNumber: order.order_number,
      currency: "EUR",
      itemTotal: Number(order.subtotal),
      shippingTotal: Number(order.shipping_cost ?? 0),
      total: Number(order.total),
      items: order.order_items.map((i) => ({
        name: i.variant_info ? `${i.product_name} (${i.variant_info})` : i.product_name,
        quantity: i.quantity,
        unitAmount: Number(i.unit_price),
      })),
      returnUrl: `${origin}/checkout/paypal-return?orderId=${order.id}`,
      cancelUrl: `${origin}/checkout?cancelOrderId=${order.id}`,
    });
    await bindProvider(order.id, result.paypalOrderId, result.approveUrl);
    return { url: result.approveUrl, paypalOrderId: result.paypalOrderId };
  });

export const capturePaypalCheckoutOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    OrderInput.extend({
      paypalOrderId: z
        .string()
        .regex(/^[A-Z0-9]+$/)
        .max(100),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { hasManagedCheckout, captureLegacyPaypal } =
      await import("@/lib/payments/legacy.server");
    if (!(await hasManagedCheckout(data.orderId)))
      return captureLegacyPaypal(data.orderId, data.paypalOrderId);
    const { order, checkout } = await getCheckout(data.orderId);
    if (
      checkout.provider_kind !== "paypal" ||
      checkout.provider_id !== data.paypalOrderId ||
      checkout.state === "released"
    )
      throw new Error("PayPal order does not match checkout");
    const expected = {
      providerId: data.paypalOrderId,
      orderNumber: order.order_number,
      total: Number(order.total),
    };
    const before = await getPaypalOrder(data.paypalOrderId);
    verifyPaypalOrder(before, expected, before.status === "COMPLETED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (checkout.state !== "paid") {
      // Atomic claim prevents a cancellation from releasing stock during capture.
      const { data: claimed, error } = await supabaseAdmin
        .from("order_checkouts")
        .update({ capture_started: true })
        .eq("order_id", order.id)
        .eq("state", "reserved")
        .select("order_id")
        .single();
      if (error || !claimed) throw new Error("This checkout is no longer payable");
    }
    const payment = await capturePaypalOrder(data.paypalOrderId);
    verifyPaypalOrder(payment, expected, true);
    await settleCheckout(order.id, "paid");
    return { orderId: order.id, orderNumber: order.order_number };
  });

export const createStripePaymentIntentForOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => {
    const stripe = getStripeClient();
    if (!stripe) throw new Error("Card payments are unavailable.");
    const { order, checkout } = await claimProvider(data.orderId, "stripe_intent");
    if (
      !checkout.provider_id &&
      Date.now() - new Date(checkout.created_at).getTime() > 25 * 60 * 1000
    )
      throw new Error("Payment initialization expired. Please contact support before retrying.");
    const intent = checkout.provider_id
      ? await stripe.paymentIntents.retrieve(checkout.provider_id)
      : await stripe.paymentIntents.create(
          {
            amount: cents(order.total),
            currency: "eur",
            receipt_email: order.customer_email,
            metadata: { orderId: order.id, orderNumber: order.order_number },
            payment_method_types: ["card"],
          },
          { idempotencyKey: `intent-${order.id}` },
        );
    if (!intent.client_secret || intent.status === "canceled" || intent.status === "succeeded")
      throw new Error("This payment is no longer available");
    await bindProvider(order.id, intent.id);
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  });

export const confirmStripeOrderPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    OrderInput.extend({ paymentIntentId: z.string().startsWith("pi_") }).parse(input),
  )
  .handler(async ({ data }) => {
    const stripe = getStripeClient();
    if (!stripe) throw new Error("Card payments are unavailable.");
    const { order, checkout } = await getCheckout(data.orderId);
    if (checkout.provider_kind !== "stripe_intent")
      throw new Error("Payment does not match checkout");
    const intent = await stripe.paymentIntents.retrieve(data.paymentIntentId);
    verifyPayment(
      {
        providerId: intent.id,
        orderId: intent.metadata.orderId,
        amount: intent.amount_received,
        currency: intent.currency,
        paid: intent.status === "succeeded",
      },
      { providerId: checkout.provider_id ?? "", orderId: order.id, total: Number(order.total) },
    );
    await settleCheckout(order.id, "paid");
    return { orderId: order.id, orderNumber: order.order_number };
  });

/** A browser return never proves payment. Query the provider before clearing a basket. */
export const refreshCheckoutPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => {
    const { order, checkout } = await getCheckout(data.orderId);
    if (
      checkout.state === "reserved" &&
      checkout.provider_kind === "stripe_checkout" &&
      checkout.provider_id
    ) {
      const stripe = getStripeClient();
      if (!stripe) throw new Error("Payment verification unavailable");
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
      }
    }
    const current = await getCheckout(data.orderId);
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: current.order.payment_status,
      total: order.total,
    };
  });

export const cancelCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => {
    const { cancelProviderCheckout } = await import("@/lib/payments/cancel.server");
    return cancelProviderCheckout(data.orderId);
  });
