import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProductIdSchema = z.object({
  productId: z.string().uuid(),
});

export const getMyWishlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wishlist")
      .select(
        `
        id,
        product_id,
        created_at,
        products (
          id,
          name,
          slug,
          price,
          short_description,
          stock_quantity,
          product_images (
            url,
            sort_order
          )
        )
      `,
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return { items: data ?? [] };
  });

export const toggleWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const existing = await context.supabase
      .from("wishlist")
      .select("id")
      .eq("user_id", context.userId)
      .eq("product_id", data.productId)
      .maybeSingle();

    if (existing.error) throw new Error(existing.error.message);

    if (existing.data?.id) {
      const { error } = await context.supabase
        .from("wishlist")
        .delete()
        .eq("id", existing.data.id);

      if (error) throw new Error(error.message);

      return { saved: false };
    }

    const { error } = await context.supabase.from("wishlist").insert({
      user_id: context.userId,
      product_id: data.productId,
    });

    if (error) throw new Error(error.message);

    return { saved: true };
  });

export const removeFromWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wishlist")
      .delete()
      .eq("user_id", context.userId)
      .eq("product_id", data.productId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });