import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getStripeClient } from "@/lib/payments/stripe.server";
import { isPaypalConfigured, createPaypalOrder, capturePaypalOrder } from "@/lib/payments/paypal.server";

const CreateCheckoutSessionSchema = z.object({
  orderId: z.string().uuid(),
  origin: z.string().url(),
});

/**
 * Creates a Stripe Checkout Session for an already-created order and
 * returns the hosted checkout URL to redirect the customer to.
 *
 * Requires STRIPE_SECRET_KEY to be set — throws a friendly error otherwise
 * so the checkout UI can fall back to COD/Bank Transfer.
 *
 * NOTE: this only starts the payment. To mark orders as paid automatically
 * you still need a Stripe webhook (checkout.session.completed) that updates
 * `orders.payment_status` — see the TODO in stripe.server.ts / README before
 * going live.
 */
export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateCheckoutSessionSchema.parse(input))
  .handler(async ({ data }) => {
    const stripe = getStripeClient();

    if (!stripe) {
      throw new Error("Card payments are not configured yet. Please choose another payment method.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    const lineItems = (order.order_items ?? []).map((item) => ({
      price_data: {
        currency: "eur",
        unit_amount: Math.round(Number(item.unit_price) * 100),
        product_data: {
          name: item.variant_info ? `${item.product_name} (${item.variant_info})` : item.product_name,
        },
      },
      quantity: item.quantity,
    }));

    if (order.shipping_cost && Number(order.shipping_cost) > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          unit_amount: Math.round(Number(order.shipping_cost) * 100),
          product_data: { name: "Shipping" },
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: order.customer_email,
      metadata: { orderId: order.id, orderNumber: order.order_number },
      success_url: `${data.origin}/orders/${order.id}?payment=success`,
      cancel_url: `${data.origin}/checkout?payment=cancelled`,
    });

    if (!session.url) throw new Error("Could not start Stripe checkout session");

    return { url: session.url };
  });

const CreatePaypalOrderSchema = z.object({
  orderId: z.string().uuid(),
  origin: z.string().url(),
});

/**
 * Creates a PayPal order for an already-created internal order and returns
 * the "approve" URL to redirect the customer to.
 *
 * Requires PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET — throws a friendly error
 * otherwise so the checkout UI can fall back to another payment method.
 */
export const createPaypalCheckoutOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaypalOrderSchema.parse(input))
  .handler(async ({ data }) => {
    if (!isPaypalConfigured()) {
      throw new Error("PayPal is not configured yet. Please choose another payment method.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    const items = (order.order_items ?? []).map((item) => ({
      name: item.variant_info ? `${item.product_name} (${item.variant_info})` : item.product_name,
      quantity: item.quantity,
      unitAmount: Number(item.unit_price),
    }));

    const itemTotal = Number(order.subtotal);
    const shippingTotal = Number(order.shipping_cost ?? 0);

    const { paypalOrderId, approveUrl } = await createPaypalOrder({
      orderNumber: order.order_number,
      currency: "EUR",
      itemTotal,
      shippingTotal,
      total: Number(order.total),
      items,
      returnUrl: `${data.origin}/checkout/paypal-return?orderId=${order.id}`,
      cancelUrl: `${data.origin}/checkout?payment=cancelled`,
    });

    // Stash the PayPal order id so the return page knows what to capture,
    // and so support can trace payments from the order record.
    await supabaseAdmin
      .from("orders")
      .update({
        admin_notes: order.admin_notes
          ? `${order.admin_notes}\nPayPal Order ID: ${paypalOrderId}`
          : `PayPal Order ID: ${paypalOrderId}`,
      })
      .eq("id", order.id);

    return { url: approveUrl, paypalOrderId };
  });

const CapturePaypalOrderSchema = z.object({
  orderId: z.string().uuid(),
  paypalOrderId: z.string().min(1),
});

/**
 * Captures an approved PayPal order and marks the matching internal order
 * as paid. Called from the /checkout/paypal-return page after the customer
 * approves payment on PayPal's site.
 */
export const capturePaypalCheckoutOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CapturePaypalOrderSchema.parse(input))
  .handler(async ({ data }) => {
    if (!isPaypalConfigured()) {
      throw new Error("PayPal is not configured");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { completed } = await capturePaypalOrder(data.paypalOrderId);

    if (!completed) {
      throw new Error("PayPal payment was not completed");
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", data.orderId)
      .select("id, order_number, total")
      .single();

    if (error || !order) throw new Error("Could not update order after payment");

    return { orderId: order.id, orderNumber: order.order_number };
  });

