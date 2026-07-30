import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getStripeClient } from "@/lib/payments/stripe.server";

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
