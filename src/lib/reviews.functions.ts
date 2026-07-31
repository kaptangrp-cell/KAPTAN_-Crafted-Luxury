import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function displayName(fullName: string | null | undefined) {
  const name = (fullName ?? "").trim();
  if (!name) return "Verified Customer";

  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

type RawReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  user_id: string;
};

async function attachReviewerNames(reviews: RawReview[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userIds = [...new Set(reviews.map((r) => r.user_id))];

  let names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    names = new Map((profiles ?? []).map((p) => [p.id, displayName(p.full_name)]));
  }

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    isVerified: Boolean(r.is_verified),
    createdAt: r.created_at,
    reviewerName: names.get(r.user_id) ?? "Verified Customer",
  }));
}

const ProductIdSchema = z.object({ productId: z.string().uuid() });

/** Public — anyone (including guests) can read a product's approved reviews. */
export const getProductReviews = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ProductIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: reviews, error } = await supabase
      .from("product_reviews")
      .select("id, rating, title, body, is_verified, created_at, user_id")
      .eq("product_id", data.productId)
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const withNames = await attachReviewerNames(reviews ?? []);

    const ratingCounts = [0, 0, 0, 0, 0]; // index 0 = 1 star ... index 4 = 5 star
    for (const r of reviews ?? []) {
      if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating - 1] += 1;
    }

    const count = reviews?.length ?? 0;
    const average = count
      ? (reviews ?? []).reduce((s, r) => s + r.rating, 0) / count
      : 0;

    return {
      reviews: withNames,
      summary: {
        count,
        average: Number(average.toFixed(2)),
        ratingCounts, // [1-star count, 2-star, 3-star, 4-star, 5-star]
      },
    };
  });

const SubmitReviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).trim().optional(),
  body: z.string().max(2000).trim().optional(),
});

/**
 * Creates or updates (upsert on the product_id+user_id unique constraint)
 * the current user's review for a product, auto-detects verified-purchase
 * status from their order history, and recomputes the product's
 * average_rating / review_count so it stays in sync without a DB trigger.
 */
export const submitProductReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: purchaseMatch } = await supabaseAdmin
      .from("orders")
      .select("id, order_items!inner(product_id)")
      .eq("user_id", context.userId)
      .eq("order_items.product_id", data.productId)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();

    const isVerified = Boolean(purchaseMatch);

    const { error: upsertError } = await supabaseAdmin.from("product_reviews").upsert(
      {
        product_id: data.productId,
        user_id: context.userId,
        rating: data.rating,
        title: data.title || null,
        body: data.body || null,
        is_verified: isVerified,
        is_approved: true,
      },
      { onConflict: "product_id,user_id" },
    );

    if (upsertError) throw new Error(upsertError.message);

    const { data: allReviews, error: countError } = await supabaseAdmin
      .from("product_reviews")
      .select("rating")
      .eq("product_id", data.productId)
      .eq("is_approved", true);

    if (countError) throw new Error(countError.message);

    const count = allReviews?.length ?? 0;
    const average = count ? allReviews.reduce((s, r) => s + r.rating, 0) / count : 0;

    await supabaseAdmin
      .from("products")
      .update({ average_rating: Number(average.toFixed(2)), review_count: count })
      .eq("id", data.productId);

    return { ok: true, isVerified };
  });

/**
 * Recent, highly-rated reviews across the whole catalog — used for the
 * homepage "What Our Customers Say" section. Callers should fall back to
 * static copy when this returns fewer than a few results (e.g. right after
 * launch, before reviews accumulate).
 */
export const getFeaturedReviews = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: reviews, error } = await supabaseAdmin
    .from("product_reviews")
    .select("id, rating, title, body, user_id, created_at, is_verified, products(name)")
    .eq("is_approved", true)
    .gte("rating", 4)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw new Error(error.message);

  const productNameById = new Map((reviews ?? []).map((r) => [r.id, r.products?.name ?? null]));
  const withNames = await attachReviewerNames(reviews ?? []);

  return {
    reviews: withNames.map((r) => ({ ...r, productName: productNameById.get(r.id) ?? null })),
  };
});
