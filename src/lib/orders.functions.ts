import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AddressSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z.string().min(3).max(40),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(80),
  state: z.string().max(80).optional().nullable(),
  postal_code: z.string().min(1).max(20),
  country: z.string().min(2).max(60),
});

const CartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(50),
});

const CreateOrderSchema = z.object({
  requestKey: z.string().uuid(),
  expectedTotal: z.number().finite().min(0),
  customer_name: z.string().min(1).max(120),
  customer_email: z.string().email(),
  customer_phone: z.string().min(3).max(40),
  shipping_address: AddressSchema,
  items: z.array(CartItemSchema).min(1).max(50),
  payment_method: z.enum(["card", "paypal"]),
  notes: z.string().max(1000).optional().nullable(),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { authenticatedUserId, checkoutOwner, checkoutOrigin, digest } =
      await import("@/lib/payments/checkout.server");
    const { isPaypalConfigured } = await import("@/lib/payments/paypal.server");
    const { getStripeClient } = await import("@/lib/payments/stripe.server");
    checkoutOrigin();
    if (
      data.payment_method === "card"
        ? !getStripeClient() || !process.env.STRIPE_WEBHOOK_SECRET
        : !isPaypalConfigured()
    ) {
      throw new Error(
        "This payment method is currently unavailable. Please choose another method.",
      );
    }
    const allowed = process.env.SHIPPING_COUNTRIES?.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (allowed?.length && !allowed.includes(data.shipping_address.country.toUpperCase()))
      throw new Error("We cannot ship to that country. Please contact support.");
    const userId = await authenticatedUserId();
    const { requestKey, ...payload } = data;
    const { data: result, error } = await supabaseAdmin.rpc("create_checkout_draft", {
      p_request_key: requestKey,
      p_owner_hash: checkoutOwner(true),
      p_request_hash: digest(JSON.stringify({ ...payload, userId })),
      p_user_id: userId,
      p_order: payload,
    });
    if (error)
      throw new Error(
        error.message.includes("stock") ||
          error.message.includes("option") ||
          error.message.includes("expired") ||
          error.message.includes("Prices changed") ||
          error.message.includes("pending checkouts")
          ? error.message
          : "Checkout could not be created. Please retry or contact support.",
      );
    return z.object({ orderId: z.string().uuid(), orderNumber: z.string() }).parse(result);
  });

export const getCheckoutReceipt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getCheckout } = await import("@/lib/payments/checkout.server");
    const { order } = await getCheckout(data.orderId);
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      total: order.total,
    };
  });

// Customer history is tied to the authenticated account, never checkout contact email.
export const getMyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readAccountOrders } = await import("./account-orders");
    return readAccountOrders(context.supabase, context.userId);
  });

export const getOrderById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { readAccountOrder } = await import("./account-orders");
    return readAccountOrder(context.supabase, context.userId, data.id);
  });
