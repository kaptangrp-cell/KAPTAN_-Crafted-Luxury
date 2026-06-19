import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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
  customer_name: z.string().min(1).max(120),
  customer_email: z.string().email(),
  customer_phone: z.string().min(3).max(40),
  shipping_address: AddressSchema,
  items: z.array(CartItemSchema).min(1).max(50),
  payment_method: z.enum(["cod", "bank_transfer"]).default("cod"),
  notes: z.string().max(1000).optional().nullable(),
});

function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KPT-${ts}-${rand}`;
}

function createGuestSupabaseClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase public environment variables");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = createGuestSupabaseClient();

    const productIds = data.items.map((i) => i.productId);
    const variantIds = data.items.map((i) => i.variantId).filter(Boolean) as string[];

    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, price, stock_quantity, is_available")
      .in("id", productIds);

    if (pErr) throw new Error(pErr.message);

    const variantMap = new Map<
      string,
      {
        id: string;
        product_id: string;
        variant_type: string;
        variant_value: string;
        price_modifier: number | null;
        stock_quantity: number | null;
      }
    >();

    if (variantIds.length) {
      const { data: variants, error: vErr } = await supabase
        .from("product_variants")
        .select("id, product_id, variant_type, variant_value, price_modifier, stock_quantity")
        .in("id", variantIds);

      if (vErr) throw new Error(vErr.message);
      variants?.forEach((v) => variantMap.set(v.id, v));
    }

    let subtotal = 0;

    const orderItems = data.items.map((item) => {
      const product = products?.find((p) => p.id === item.productId);

      if (!product || product.is_available === false) {
        throw new Error(`Product unavailable: ${item.productId}`);
      }

      if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      const unitPrice = Number(product.price) + Number(variant?.price_modifier ?? 0);
      const lineTotal = unitPrice * item.quantity;

      subtotal += lineTotal;

      return {
        product_id: product.id,
        variant_id: variant?.id ?? null,
        product_name: product.name,
        variant_info: variant ? `${variant.variant_type}: ${variant.variant_value}` : null,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });

    const shipping_cost = subtotal > 50 ? 0 : 5.99;
    const total = subtotal + shipping_cost;
    const order_number = generateOrderNumber();

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        order_number,
        user_id: null,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        shipping_address: data.shipping_address,
        payment_method: data.payment_method,
        payment_status: "pending",
        status: "pending",
        subtotal,
        shipping_cost,
        discount: 0,
        total,
        admin_notes: data.notes ?? null,
      })
      .select("id, order_number")
      .single();

    if (oErr) throw new Error(oErr.message);

    const itemsWithOrder = orderItems.map((i) => ({
      ...i,
      order_id: order.id,
    }));

    const { error: iErr } = await supabase.from("order_items").insert(itemsWithOrder);

    if (iErr) {
      await supabase.from("orders").delete().eq("id", order.id);
      throw new Error(iErr.message);
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
    };
  });

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total, created_at, order_items(quantity, product_name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return { orders: data ?? [] };
  });

export const getOrderById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();

    if (error) throw new Error(error.message);

    return { order };
  });