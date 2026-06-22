import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!data || data.role !== "admin") throw new Error("Forbidden");
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [products, orders, customers, revenueRes, recent] = await Promise.all([
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id, status", { count: "exact" }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("total").neq("status", "cancelled"),
      supabaseAdmin
        .from("orders")
        .select("id, order_number, customer_name, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const revenue = (revenueRes.data ?? []).reduce((s, r) => s + Number(r.total), 0);

    const statusCounts = (orders.data ?? []).reduce<Record<string, number>>((acc, o) => {
      const k = o.status ?? "ordered";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    return {
      productCount: products.count ?? 0,
      orderCount: orders.count ?? 0,
      customerCount: customers.count ?? 0,
      revenue,
      statusCounts,
      recentOrders: recent.data ?? [],
    };
  });

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, price, stock_quantity, is_available, is_featured, category_id, categories(name), product_images(url, sort_order)")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { products: data ?? [] };
  });

const ProductSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  category_id: z.string().uuid().nullable(),
  short_description: z.string().max(500).nullable(),
  full_description: z.string().max(5000).nullable(),
  price: z.number().min(0),
  compare_at_price: z.number().min(0).nullable(),
  stock_quantity: z.number().int().min(0),
  is_available: z.boolean(),
  is_featured: z.boolean(),
  image_url: z.string().url().max(2000).nullable().optional(),
});

export const adminUpsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { id, image_url, ...payload } = data;
    let productId = id;

    if (id) {
      const { error } = await supabaseAdmin.from("products").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("products")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      productId = row.id;
    }

    if (image_url && productId) {
      await supabaseAdmin.from("product_images").delete().eq("product_id", productId);
      await supabaseAdmin.from("product_images").insert({
        product_id: productId,
        url: image_url,
        sort_order: 0,
        alt_text: payload.name,
      });
    }

    return { id: productId };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const adminListCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin.from("categories").select("*").order("sort_order");
    if (error) throw new Error(error.message);

    return { categories: data ?? [] };
  });

const CategorySchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).nullable(),
  image_url: z.string().url().max(2000).nullable(),
  sort_order: z.number().int().min(0),
});

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CategorySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { id, ...payload } = data;

    if (id) {
      const { error } = await supabaseAdmin.from("categories").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("categories")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return { id: row.id };
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, customer_name, customer_email, total, status, payment_status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    return { orders: data ?? [] };
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string }) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["ordered", "packaging", "out_for_delivery", "delivered", "cancelled"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const adminListCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, role, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return { customers: data ?? [] };
  });