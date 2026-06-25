import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const adminGetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyticsSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("orders")
      .select("id, order_number, customer_name, total, status, payment_status, created_at, order_items(product_name, quantity, line_total)")
      .order("created_at", { ascending: true });

    if (data.period !== "all") {
      query = query
        .gte("created_at", getPeriodStart(data.period).toISOString())
        .lt("created_at", getPeriodEnd(data.period).toISOString());
    }

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);

    const filteredOrders = (orders ?? []).filter((o: any) => {
      if (!data.productName || data.productName === "all") return true;
      return (o.order_items ?? []).some((i: any) => i.product_name === data.productName);
    });

    const salesByDay = new Map<string, { date: string; revenue: number; orders: number }>();
    const statusRevenue = new Map<string, { status: string; revenue: number; orders: number }>();
    const bestProducts = new Map<string, { product_name: string; quantity: number; revenue: number }>();
    const productNames = new Set<string>();

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
      }
    }

    const totalRevenue = filteredOrders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

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

async function sendOrderStatusEmail({
  to,
  customerName,
  orderNumber,
  status,
}: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: "ordered" | "packaging" | "out_for_delivery" | "delivered" | "cancelled";
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "KAPTAN <orders@kaptangrp.com>";

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY missing. Email not sent.");
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY);

  const statusText = statusLabelForEmail(status);
  const message = statusMessageForEmail(status);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `KAPTAN Order ${orderNumber}: ${statusText}`,
    html: `
      <div style="font-family: Arial, sans-serif; background:#000; color:#fff; padding:30px;">
        <div style="max-width:600px; margin:auto; border:1px solid #FFEB00; padding:24px;">
          <h1 style="color:#FFEB00; margin:0 0 16px;">KAPTAN</h1>
          <h2 style="margin:0 0 16px;">Order Status Updated</h2>

          <p>Hi ${escapeHtml(customerName || "Customer")},</p>

          <p>Your order <strong style="color:#FFEB00;">${escapeHtml(orderNumber)}</strong> status is now:</p>

          <p style="font-size:22px; font-weight:bold; color:#FFEB00;">
            ${escapeHtml(statusText)}
          </p>

          <p>${escapeHtml(message)}</p>

          <p style="margin-top:24px;">Thank you for shopping with KAPTAN.</p>

          <hr style="border:none; border-top:1px solid rgba(255,235,0,0.3); margin:24px 0;" />

          <p style="font-size:12px; color:#aaa;">
            This is an automatic email from KAPTAN. Please do not reply to this message.
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error("Order status email failed:", error);
    throw new Error(
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "Order status email failed"
    );
  }

  console.log("Order status email sent to:", to);
}

function statusLabelForEmail(status: string) {
  switch (status) {
    case "ordered":
      return "Ordered";
    case "packaging":
      return "Packaging";
    case "out_for_delivery":
      return "Out for Delivery";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    default:
      return "Updated";
  }
}

function statusMessageForEmail(status: string) {
  switch (status) {
    case "ordered":
      return "We have received your order and it is now in our system.";
    case "packaging":
      return "Your order is being prepared and packed carefully.";
    case "out_for_delivery":
      return "Your order is on the way and will be delivered soon.";
    case "delivered":
      return "Your order has been delivered. We hope you enjoy your purchase.";
    case "cancelled":
      return "Your order has been cancelled. If you have questions, please contact our support team.";
    default:
      return "Your order status has been updated.";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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