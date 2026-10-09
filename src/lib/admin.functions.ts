import { reportingWindow, summarizeOrders } from "@/lib/admin-analytics";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendOrderStatusEmail } from "@/lib/server/email.server";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!data || data.role !== "admin") throw new Error("Forbidden");
}

const AnalyticsSchema = z.object({
  period: z.enum(["all", "7d", "30d", "90d", "this_month", "last_month"]).default("30d"),
  status: z.string().optional(),
  productName: z.string().optional(),
});

async function readAllRows<T>(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await readPage(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export const getAdminStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const [products, orders, customers, todaysCustomers] = await Promise.all([
      readAllRows((from, to) =>
        supabaseAdmin
          .from("products")
          .select("id, name, stock_quantity, low_stock_threshold, is_available")
          .order("id")
          .range(from, to),
      ),
      readAllRows((from, to) =>
        supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, customer_name, total, status, payment_status, created_at, order_items(quantity)",
          )
          .in("payment_status", ["paid", "refunded", "partially_refunded"])
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer")
        .gte("created_at", todayStart.toISOString()),
    ]);
    if (customers.error || todaysCustomers.error) throw new Error("Could not load customer totals");
    const paid = orders.filter((o) => o.payment_status === "paid" && o.status !== "cancelled");
    const today = paid.filter((o) => o.created_at && o.created_at >= todayStart.toISOString());
    const lowStock = products.filter(
      (p) => p.is_available && p.stock_quantity <= (p.low_stock_threshold ?? 5),
    );
    return {
      productCount: products.length,
      orderCount: orders.length,
      customerCount: customers.count ?? 0,
      revenue: paid.reduce((sum, o) => sum + Number(o.total), 0),
      statusCounts: orders.reduce<Record<string, number>>((counts, o) => {
        const status = o.status ?? "ordered";
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}),
      recentOrders: orders.slice(0, 8),
      todaysSales: today.reduce((sum, o) => sum + Number(o.total), 0),
      todaysOrderCount: today.length,
      todaysNewCustomers: todaysCustomers.count ?? 0,
      todaysProductsSold: today.reduce(
        (sum, o) => sum + o.order_items.reduce((n, i) => n + i.quantity, 0),
        0,
      ),
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock.sort((a, b) => a.stock_quantity - b.stock_quantity).slice(0, 5),
      pendingOrdersCount: paid.filter((o) => o.status === "ordered" || o.status === "pending")
        .length,
    };
  });

export const adminGetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyticsSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { start: periodStart, end: periodEnd } = reportingWindow(data.period);

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, user_id, total, status, payment_status, created_at, order_items(product_id, product_name, quantity, line_total, products(cost_price))",
      )
      .order("created_at", { ascending: true })
      .order("id");

    if (periodStart && periodEnd) {
      query = query
        .gte("created_at", periodStart.toISOString())
        .lt("created_at", periodEnd.toISOString());
    }

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const orders = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await query.range(offset, offset + 499);
      if (error) throw new Error(error.message);
      orders.push(...(page ?? []));
      if (!page || page.length < 500) break;
    }

    // Visits logged in the same window, for conversion rate = orders / visits.
    let visitsQuery = supabaseAdmin
      .from("site_visits")
      .select("id", { count: "exact", head: true });
    if (periodStart && periodEnd) {
      visitsQuery = visitsQuery
        .gte("created_at", periodStart.toISOString())
        .lt("created_at", periodEnd.toISOString());
    }
    const { count: totalVisits, error: visitsError } = await visitsQuery;
    if (visitsError) throw new Error(visitsError.message);

    return summarizeOrders(orders ?? [], totalVisits ?? 0, data.productName);
  });

export const adminExportOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orders = await readAllRows((from, to) =>
      supabaseAdmin
        .from("orders")
        .select("*, order_items(*)")
        .in("payment_status", ["paid", "refunded", "partially_refunded"])
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    return { orders };
  });

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        `
        id,
        name,
        slug,
        price,
        compare_at_price,
        cost_price,
        short_description,
        full_description,
        specifications,
        stock_quantity,
        low_stock_threshold,
        is_available,
        is_featured,
        category_id,
        categories(name),
        product_images(id, url, sort_order, alt_text, media_type)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { products: data ?? [] };
  });

const MediaItemSchema = z.object({
  url: z.string().url().max(2000),
  media_type: z.enum(["image", "video"]),
  sort_order: z.number().int().min(0),
});

const ProductSpecificationValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string().max(5000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(ProductSpecificationValue),
    z.record(ProductSpecificationValue),
  ]),
);

const ProductSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  category_id: z.string().uuid().nullable(),
  short_description: z.string().max(500).nullable(),
  full_description: z.string().max(5000).nullable(),
  specifications: z.record(ProductSpecificationValue).optional(),
  price: z.number().min(0),
  compare_at_price: z.number().min(0).nullable(),
  cost_price: z.number().min(0).nullable(),
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
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
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

    const { data: inserted, error } = await supabaseAdmin
      .from("products")
      .insert(rows)
      .select("id");
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
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
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

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderNumber: z.string().trim().max(100).optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data: input }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, total, status, payment_status, created_at, shipping_address, order_items(id, product_name, quantity, line_total)",
      )
      .in("payment_status", ["paid", "refunded", "partially_refunded"])
      .order("created_at", { ascending: false })
      .limit(100);

    if (input.orderNumber) query = query.eq("order_number", input.orderNumber);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { orders: data ?? [] };
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["ordered", "packaging", "out_for_delivery", "delivered", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: beforeOrder, error: beforeError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, customer_name, customer_email, status, payment_status")
      .eq("id", data.id)
      .single();

    if (beforeError) throw new Error(beforeError.message);
    if (!["paid", "refunded", "partially_refunded"].includes(beforeOrder.payment_status ?? ""))
      throw new Error("Unpaid checkouts are not orders and cannot be fulfilled.");

    if (data.status === "cancelled") {
      const { data: checkout, error: lookupError } = await supabaseAdmin
        .from("order_checkouts")
        .select("state")
        .eq("order_id", data.id)
        .maybeSingle();
      if (lookupError) throw new Error("Could not check the payment before cancellation");
      if (checkout?.state === "reserved") {
        const { cancelProviderCheckout } = await import("@/lib/payments/cancel.server");
        await cancelProviderCheckout(data.id, false);
      }
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    if (beforeOrder?.status !== data.status && beforeOrder?.customer_email) {
      await sendOrderStatusEmail({
        to: beforeOrder.customer_email,
        customerName: beforeOrder.customer_name,
        orderNumber: beforeOrder.order_number,
        status: data.status,
      });
    }

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
