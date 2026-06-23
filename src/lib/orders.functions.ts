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
  user_id: z.string().uuid().nullable().optional(),
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

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const productIds = data.items.map((i) => i.productId);
    const variantIds = data.items.map((i) => i.variantId).filter(Boolean) as string[];

    const { data: products, error: pErr } = await supabaseAdmin
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
      const { data: variants, error: vErr } = await supabaseAdmin
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

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number,
        user_id: data.user_id ?? null,
        customer_name: data.customer_name,
        customer_email: data.customer_email.toLowerCase(),
        customer_phone: data.customer_phone,
        shipping_address: data.shipping_address,
        payment_method: data.payment_method,
        payment_status: "pending",
        status: "ordered",
        subtotal,
        shipping_cost,
        discount: 0,
        total,
        admin_notes: data.notes ?? null,
      })
      .select("id, order_number")
      .single();

    if (oErr) throw new Error(oErr.message);

    const { error: iErr } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems.map((item) => ({ ...item, order_id: order.id })));

    if (iErr) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      throw new Error(iErr.message);
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
    };
  });

async function getAuthEmail(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email?.toLowerCase() ?? null;
}

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getAuthEmail(context.userId);

    let query = supabaseAdmin
      .from("orders")
      .select("id, order_number, status, payment_status, total, created_at, customer_email, order_items(quantity, product_name)")
      .order("created_at", { ascending: false });

    if (email) {
      query = query.or(`user_id.eq.${context.userId},customer_email.eq.${email}`);
    } else {
      query = query.eq("user_id", context.userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    return { orders: data ?? [] };
  });

export const getOrderById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getAuthEmail(context.userId);

    let query = supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.id);

    if (email) {
      query = query.or(`user_id.eq.${context.userId},customer_email.eq.${email}`);
    } else {
      query = query.eq("user_id", context.userId);
    }

    const { data: order, error } = await query.single();

    if (error) throw new Error(error.message);

    return { order };
  });