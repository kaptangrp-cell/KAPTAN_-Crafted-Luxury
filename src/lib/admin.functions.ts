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
      .select(`
        id,
        name,
        slug,
        price,
        compare_at_price,
        short_description,
        full_description,
        stock_quantity,
        is_available,
        is_featured,
        category_id,
        categories(name),
        product_images(id, url, sort_order, alt_text, media_type)
      `)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return { products: data ?? [] };
  });

const MediaItemSchema = z.object({
  url: z.string().url().max(2000),
  media_type: z.enum(["image", "video"]),
  sort_order: z.number().int().min(0),
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
  media_items: z.array(MediaItemSchema).optional().default([]),
});

export const adminUpsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { id, media_items, ...payload } = data;
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

    if (productId) {
      await supabaseAdmin.from("product_images").delete().eq("product_id", productId);

      const cleanMedia = (media_items ?? []).filter((m) => m.url.trim());

      if (cleanMedia.length > 0) {
        const { error } = await supabaseAdmin.from("product_images").insert(
          cleanMedia.map((m, index) => ({
            product_id: productId,
            url: m.url,
            media_type: m.media_type,
            sort_order: index,
            alt_text: payload.name,
          })),
        );

        if (error) throw new Error(error.message);
      }
    }

    return { id: productId };
  });

const BulkProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  category_slug: z.string().min(1).max(100),
  short_description: z.string().max(500).nullable().optional(),
  full_description: z.string().max(5000).nullable().optional(),
  price: z.number().min(0),
  compare_at_price: z.number().min(0).nullable().optional(),
  stock_quantity: z.number().int().min(0),
  is_available: z.boolean().default(true),
  is_featured: z.boolean().default(false),
});

const BulkCreateProductsSchema = z.object({
  products: z.array(BulkProductSchema).min(1).max(500),
});

export const adminBulkCreateProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BulkCreateProductsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const categorySlugs = [...new Set(data.products.map((p) => p.category_slug))];

    const { data: categories, error: catErr } = await supabaseAdmin
      .from("categories")
      .select("id, slug")
      .in("slug", categorySlugs);

    if (catErr) throw new Error(catErr.message);

    const categoryMap = new Map((categories ?? []).map((c) => [c.slug, c.id]));
    const missingCategories = categorySlugs.filter((slug) => !categoryMap.has(slug));

    if (missingCategories.length > 0) {
      throw new Error(`Category slug not found: ${missingCategories.join(", ")}`);
    }

    const slugs = data.products.map((p) => p.slug);

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("products")
      .select("slug")
      .in("slug", slugs);

    if (existingErr) throw new Error(existingErr.message);

    const existingSlugs = new Set((existing ?? []).map((p) => p.slug));

    if (existingSlugs.size > 0) {
      throw new Error(`Product slug already exists: ${Array.from(existingSlugs).join(", ")}`);
    }

    const rows = data.products.map((p) => ({
      name: p.name,
      slug: p.slug,
      category_id: categoryMap.get(p.category_slug) ?? null,
      short_description: p.short_description || null,
      full_description: p.full_description || null,
      price: p.price,
      compare_at_price: p.compare_at_price ?? null,
      stock_quantity: p.stock_quantity,
      is_available: p.is_available,
      is_featured: p.is_featured,
    }));

    const { data: inserted, error } = await supabaseAdmin.from("products").insert(rows).select("id");

    if (error) throw new Error(error.message);

    return { created: inserted?.length ?? 0 };
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

    const { error } = await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", data.id);

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