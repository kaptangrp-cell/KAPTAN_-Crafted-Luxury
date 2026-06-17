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
  .inputValidator((input: { categorySlug?: string; search?: string; limit?: number; offset?: number }) => input)
  .handler(async ({ data }) => {
    let query = supabase
      .from("products")
      .select("*, categories(name, slug), product_images(url, sort_order)")
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 24) - 1);

    if (data.categorySlug) {
      query = query.eq("categories.slug", data.categorySlug);
    }

    if (data.search) {
      query = query.ilike("name", `%${data.search}%`);
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
    .select("*, categories(name, slug), product_images(url, sort_order)")
    .eq("is_featured", true)
    .eq("is_available", true)
    .order("sold_count", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return { products: data ?? [] };
});
