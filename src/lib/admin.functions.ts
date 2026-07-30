import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendOrderStatusEmail } from "@/lib/server/email.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!data || data.role !== "admin") throw new Error("Forbidden");
}

const AnalyticsSchema = z.object({
  period: z.enum(["all", "7d", "30d", "90d", "this_month", "last_month"]).default("30d"),
  status: z.string().optional(),
  productName: z.string().optional(),
});

function getPeriodStart(period: string) {
  const now = new Date();
  const start = new Date(now);

  if (period === "7d") start.setDate(now.getDate() - 7);
  if (period === "30d") start.setDate(now.getDate() - 30);
  if (period === "90d") start.setDate(now.getDate() - 90);

  if (period === "this_month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  if (period === "last_month") {
    start.setMonth(now.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return start;
}

function getPeriodEnd(period: string) {
  const now = new Date();

  if (period !== "last_month") return now;

  const end = new Date(now);
  end.setDate(1);
  end.setHours(0, 0, 0, 0);
  return end;
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartIso = todayStart.toISOString();

    const [
      products,
      orders,
      customers,
      revenueRes,
      recent,
      todaysOrdersRes,
      todaysCustomersRes,
      lowStockProductsRes,
      pendingOrdersRes,
    ] = await Promise.all([
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id, status", { count: "exact" }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("total").neq("status", "cancelled"),
      supabaseAdmin
        .from("orders")
        .select("id, order_number, customer_name, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("orders")
        .select("id, total, status, order_items(quantity)")
        .gte("created_at", todayStartIso),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStartIso),
      supabaseAdmin
        .from("products")
        .select("id, stock_quantity, low_stock_threshold")
        .eq("is_available", true),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "ordered"),
    ]);

    const revenue = (revenueRes.data ?? []).reduce((s, r) => s + Number(r.total), 0);

    const statusCounts = (orders.data ?? []).reduce<Record<string, number>>((acc, o) => {
      const k = o.status ?? "ordered";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    const todaysOrders = (todaysOrdersRes.data ?? []).filter((o) => o.status !== "cancelled");
    const todaysSales = todaysOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const todaysProductsSold = todaysOrders.reduce(
      (s, o) => s + (o.order_items ?? []).reduce((si, item) => si + Number(item.quantity ?? 0), 0),
      0,
    );

    const lowStockCount = (lowStockProductsRes.data ?? []).filter(
      (p) => Number(p.stock_quantity ?? 0) <= Number(p.low_stock_threshold ?? 5),
    ).length;

    return {
      productCount: products.count ?? 0,
      orderCount: orders.count ?? 0,
      customerCount: customers.count ?? 0,
      revenue,
      statusCounts,
      recentOrders: recent.data ?? [],
      todaysSales,
      todaysOrderCount: todaysOrders.length,
      todaysNewCustomers: todaysCustomersRes.count ?? 0,
      todaysProductsSold,
      lowStockCount,
      pendingOrdersCount: pendingOrdersRes.count ?? 0,
    };
  });

export const adminGetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyticsSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const periodStart = data.period !== "all" ? getPeriodStart(data.period) : null;
    const periodEnd = data.period !== "all" ? getPeriodEnd(data.period) : null;

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, user_id, total, status, payment_status, created_at, order_items(product_id, product_name, quantity, line_total, products(cost_price))",
      )
      .order("created_at", { ascending: true });

    if (periodStart && periodEnd) {
      query = query.gte("created_at", periodStart.toISOString()).lt("created_at", periodEnd.toISOString());
    }

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);

    // Visits logged in the same window, for conversion rate = orders / visits.
    let visitsQuery = supabaseAdmin.from("site_visits").select("id", { count: "exact", head: true });
    if (periodStart && periodEnd) {
      visitsQuery = visitsQuery.gte("created_at", periodStart.toISOString()).lt("created_at", periodEnd.toISOString());
    }
    const { count: totalVisits, error: visitsError } = await visitsQuery;
    if (visitsError) throw new Error(visitsError.message);

    const filteredOrders = (orders ?? []).filter((o: any) => {
      if (!data.productName || data.productName === "all") return true;
      return (o.order_items ?? []).some((i: any) => i.product_name === data.productName);
    });

    const salesByDay = new Map<string, { date: string; revenue: number; orders: number }>();
    const statusRevenue = new Map<string, { status: string; revenue: number; orders: number }>();
    const bestProducts = new Map<string, { product_name: string; quantity: number; revenue: number }>();
    const productNames = new Set<string>();
    const customerOrderCounts = new Map<string, number>();

    let totalCost = 0;
    let costTrackedRevenue = 0;
    let itemsMissingCost = 0;

    for (const order of filteredOrders) {
      const date = new Date(order.created_at).toISOString().slice(0, 10);
      const day = salesByDay.get(date) ?? { date, revenue: 0, orders: 0 };
      day.revenue += Number(order.total ?? 0);
      day.orders += 1;
      salesByDay.set(date, day);

      const status = order.status ?? "ordered";
      const statusRow = statusRevenue.get(status) ?? { status, revenue: 0, orders: 0 };
      statusRow.revenue += Number(order.total ?? 0);
      statusRow.orders += 1;
      statusRevenue.set(status, statusRow);

      const customerKey = order.user_id ?? order.customer_email?.toLowerCase() ?? order.id;
      customerOrderCounts.set(customerKey, (customerOrderCounts.get(customerKey) ?? 0) + 1);

      for (const item of order.order_items ?? []) {
        productNames.add(item.product_name);
        const p = bestProducts.get(item.product_name) ?? {
          product_name: item.product_name,
          quantity: 0,
          revenue: 0,
        };
        p.quantity += Number(item.quantity ?? 0);
        p.revenue += Number(item.line_total ?? 0);
        bestProducts.set(item.product_name, p);

        const costPrice = item.products?.cost_price;
        if (costPrice === null || costPrice === undefined) {
          itemsMissingCost += 1;
        } else {
          totalCost += Number(costPrice) * Number(item.quantity ?? 0);
          costTrackedRevenue += Number(item.line_total ?? 0);
        }
      }
    }

    const totalRevenue = filteredOrders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

    const totalCustomers = customerOrderCounts.size;
    const returningCustomers = Array.from(customerOrderCounts.values()).filter((n) => n > 1).length;
    const returningCustomerRate = totalCustomers ? returningCustomers / totalCustomers : 0;

    const conversionRate = totalVisits ? totalOrders / totalVisits : null;

    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      productNames: Array.from(productNames).sort(),
      salesByDay: Array.from(salesByDay.values()).map((r) => ({
        ...r,
        revenue: Number(r.revenue.toFixed(2)),
      })),
      revenueByStatus: Array.from(statusRevenue.values()).map((r) => ({
        ...r,
        revenue: Number(r.revenue.toFixed(2)),
      })),
      bestProducts: Array.from(bestProducts.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((r) => ({
          ...r,
          revenue: Number(r.revenue.toFixed(2)),
        })),
      returningCustomers,
      totalCustomers,
      returningCustomerRate,
      totalVisits: totalVisits ?? 0,
      conversionRate,
      profit: Number((costTrackedRevenue - totalCost).toFixed(2)),
      profitRevenueBasis: Number(costTrackedRevenue.toFixed(2)),
      itemsMissingCost,
    };
  });

export const adminExportOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { orders: data ?? [] };
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
        cost_price,
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
      const { data: row, error } = await supabaseAdmin.from("products").insert(payload).select("id").single();
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

    const { data: row, error } = await supabaseAdmin.from("categories").insert(payload).select("id").single();
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

    const { data: beforeOrder, error: beforeError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, customer_name, customer_email, status")
      .eq("id", data.id)
      .single();

    if (beforeError) throw new Error(beforeError.message);

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