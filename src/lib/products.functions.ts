import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const getCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return { categories: data ?? [] };
});

export const getProducts = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      categorySlug?: string;
      search?: string;
      limit?: number;
      offset?: number;
      sort?: "newest" | "price_asc" | "price_desc" | "popular";
      minPrice?: number;
      maxPrice?: number;
      inStockOnly?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    let categoryId: string | null = null;

    if (data.categorySlug) {
      const { data: category, error: catError } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .single();

      if (catError) return { products: [] };

      categoryId = category?.id ?? null;

      if (!categoryId) return { products: [] };
    }

    let query = supabase
      .from("products")
      .select("*, categories(name, slug), product_images(url, sort_order, media_type)")
      .eq("is_available", true)
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 24) - 1);

    switch (data.sort) {
      case "price_asc":
        query = query.order("price", { ascending: true });
        break;
      case "price_desc":
        query = query.order("price", { ascending: false });
        break;
      case "popular":
        query = query.order("sold_count", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (data.search) {
      query = query.ilike("name", `%${data.search}%`);
    }

    if (typeof data.minPrice === "number") {
      query = query.gte("price", data.minPrice);
    }

    if (typeof data.maxPrice === "number") {
      query = query.lte("price", data.maxPrice);
    }

    if (data.inStockOnly) {
      query = query.gt("stock_quantity", 0);
    }

    const { data: products, error } = await query;

    if (error) throw new Error(error.message);

    return { products: products ?? [] };
  });

export const getProductBySlug = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { data: product, error } = await supabase
      .from("products")
      .select("*, categories(name, slug), product_images(*), product_variants(*)")
      .eq("slug", data.slug)
      .single();

    if (error) throw new Error(error.message);

    return { product };
  });

export const getFeaturedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabase
    .from("products")
    .select("*, categories(name, slug), product_images(url, sort_order, media_type)")
    .eq("is_featured", true)
    .eq("is_available", true)
    .order("sold_count", { ascending: false })
    .limit(8);

  if (error) throw new Error(error.message);

  return { products: data ?? [] };
});

export const getRelatedProducts = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { categoryId?: string | null; excludeProductId: string; limit?: number }) => input,
  )
  .handler(async ({ data }) => {
    if (!data.categoryId) return { products: [] };

    const { data: products, error } = await supabase
      .from("products")
      .select("*, categories(name, slug), product_images(url, sort_order, media_type)")
      .eq("category_id", data.categoryId)
      .eq("is_available", true)
      .neq("id", data.excludeProductId)
      .order("sold_count", { ascending: false })
      .limit(data.limit ?? 4);

    if (error) throw new Error(error.message);

    return { products: products ?? [] };
  });

export const getProductsByIds = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data }) => {
    if (!data.ids.length) return { products: [] };

    const { data: products, error } = await supabase
      .from("products")
      .select("*, categories(name, slug), product_images(url, sort_order, media_type)")
      .in("id", data.ids)
      .eq("is_available", true);

    if (error) throw new Error(error.message);

    // Supabase doesn't preserve .in() input order, so re-sort to match the
    // caller's order (most-recently-viewed-first for "Recently Viewed").
    const order = new Map(data.ids.map((id, index) => [id, index]));
    const sorted = [...(products ?? [])].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );

    return { products: sorted };
  });

export const getRecommendedProducts = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { categoryIds: string[]; excludeIds?: string[]; limit?: number }) => input,
  )
  .handler(async ({ data }) => {
    if (!data.categoryIds.length) return { products: [] };

    let query = supabase
      .from("products")
      .select("*, categories(name, slug), product_images(url, sort_order, media_type)")
      .in("category_id", data.categoryIds)
      .eq("is_available", true)
      .order("sold_count", { ascending: false })
      .limit(data.limit ?? 8);

    if (data.excludeIds?.length) {
      query = query.not("id", "in", `(${data.excludeIds.join(",")})`);
    }

    const { data: products, error } = await query;

    if (error) throw new Error(error.message);

    return { products: products ?? [] };
  });
