import { useEffect, useState } from "react";
import { createFileRoute, notFound, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShoppingBag,
  Minus,
  Plus,
  ShieldCheck,
  Truck,
  Leaf,
  Heart,
  CreditCard,
  Play,
  Star,
  Sparkles,
  BadgeCheck,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { getProductBySlug, getRelatedProducts, getProductsByIds } from "@/lib/products.functions";
import { toggleWishlist } from "@/lib/wishlist.functions";
import { getProductReviews, submitProductReview } from "@/lib/reviews.functions";
import { trackProductView, getRecentlyViewedIds } from "@/lib/recentlyViewed";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductCard } from "@/components/product/ProductCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

const CARE_INSTRUCTIONS = [
  "Wipe clean with a soft, dry cloth after each use to remove dust and surface residue.",
  "Keep away from direct sunlight, heat sources, and prolonged moisture exposure.",
  "Apply a quality leather conditioner every 2–3 months to preserve suppleness.",
  "Store in the provided dust bag when not in use to prevent scratches and dryness.",
];

function productQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
  });
}

function relatedProductsQueryOptions(categoryId: string | null | undefined, excludeId: string) {
  return queryOptions({
    queryKey: ["related-products", categoryId, excludeId],
    queryFn: () => getRelatedProducts({ data: { categoryId, excludeProductId: excludeId, limit: 4 } }),
    enabled: Boolean(categoryId),
  });
}

function recentlyViewedQueryOptions(ids: string[]) {
  return queryOptions({
    queryKey: ["recently-viewed", ids],
    queryFn: () => getProductsByIds({ data: { ids } }),
    enabled: ids.length > 0,
  });
}

function reviewsQueryOptions(productId: string) {
  return queryOptions({
    queryKey: ["product-reviews", productId],
    queryFn: () => getProductReviews({ data: { productId } }),
  });
}

export const Route = createFileRoute("/products_/$slug")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(productQueryOptions(params.slug));
    } catch {
      throw notFound();
    }
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — KAPTAN` }],
  }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productQueryOptions(slug));

  const product = data?.product as never as {
    id: string;
    name: string;
    slug: string;
    price: number;
    compare_at_price: number | null;
    short_description: string | null;
    full_description: string | null;
    stock_quantity: number | null;
    tags: string[] | null;
    category_id: string | null;
    average_rating: number | null;
    review_count: number | null;
    product_images: {
      id: string;
      url: string;
      alt_text: string | null;
      sort_order?: number | null;
      media_type?: "image" | "video" | null;
    }[];
    product_variants: {
      id: string;
      variant_type: string;
      variant_value: string;
      price_modifier: number | null;
      is_available: boolean | null;
    }[];
    categories: { name: string; slug: string } | null;
  };

  const [qty, setQty] = useState(1);
  const [activeMedia, setActiveMedia] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const toggleWishlistFn = useServerFn(toggleWishlist);

  const { data: relatedData } = useQuery(
    relatedProductsQueryOptions(product.category_id, product.id),
  );
  const relatedProducts = relatedData?.products ?? [];

  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    trackProductView(product.id);
    setRecentIds(getRecentlyViewedIds(product.id, 8));
  }, [product.id]);

  const { data: recentlyViewedData } = useQuery(recentlyViewedQueryOptions(recentIds));
  const recentlyViewedProducts = recentlyViewedData?.products ?? [];

  const { data: reviewsData } = useQuery(reviewsQueryOptions(product.id));
  const reviews = reviewsData?.reviews ?? [];
  const reviewSummary = reviewsData?.summary ?? {
    count: product.review_count ?? 0,
    average: product.average_rating ?? 0,
    ratingCounts: [0, 0, 0, 0, 0],
  };

  const submitReviewFn = useServerFn(submitProductReview);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  function openReviewDialog() {
    if (!user) {
      toast.error("Please sign in to write a review");
      return;
    }
    setReviewDialogOpen(true);
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();

    if (reviewRating < 1) {
      toast.error("Please select a star rating");
      return;
    }

    try {
      setSubmittingReview(true);
      const result = await submitReviewFn({
        data: {
          productId: product.id,
          rating: reviewRating,
          title: reviewTitle || undefined,
          body: reviewBody || undefined,
        },
      });
      toast.success(
        result.isVerified ? "Thanks! Your verified review is live." : "Thanks for your review!",
      );
      setReviewDialogOpen(false);
      setReviewRating(0);
      setReviewTitle("");
      setReviewBody("");
      qc.invalidateQueries({ queryKey: ["product-reviews", product.id] });
      qc.invalidateQueries({ queryKey: ["product", slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit review");
    } finally {
      setSubmittingReview(false);
    }
  }

  const media = product.product_images?.length
    ? [...product.product_images].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    : [
        {
          id: "ph",
          url: "https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80",
          alt_text: product.name,
          media_type: "image" as const,
        },
      ];

  const active = media[activeMedia];
  const firstImage = media.find((m) => m.media_type !== "video") ?? media[0];

  const variants = product.product_variants ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const finalPrice = Number(product.price) + Number(variant?.price_modifier ?? 0);
  const outOfStock = product.stock_quantity === 0;
  const maxQty = product.stock_quantity ?? 99;

  function handleAdd() {
    addItem(product as never, variant as never, qty, firstImage.url);
    toast.success(`${product.name} added to cart`);
    openCart();
  }

  async function handleWishlistToggle() {
    if (!user) {
      toast.error("Please sign in to save wishlist items");
      return;
    }

    try {
      setWishlistLoading(true);
      const result = await toggleWishlistFn({ data: { productId: product.id } });
      setWishlisted(result.saved);
      toast.success(result.saved ? "Added to wishlist" : "Removed from wishlist");
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wishlist failed");
    } finally {
      setWishlistLoading(false);
    }
  }

  function handleBuyNow() {
    addItem(product as never, variant as never, qty, firstImage.url);
    toast.success(`${product.name} added to cart`);
    navigate({ to: "/checkout" });
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <nav className="mb-6 text-xs text-white/50">
          <Link to="/" className="hover:text-gold">Home</Link> /{" "}
          <Link to="/products" className="hover:text-gold">Shop</Link>
          {product.categories && (
            <> / <span className="text-gold/70">{product.categories.name}</span></>
          )}
        </nav>

        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <div className="aspect-square overflow-hidden border border-gold/10 bg-[#1A1A1A]">
              {active.media_type === "video" ? (
                <video
                  src={active.url}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={active.url}
                  alt={active.alt_text ?? product.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {media.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {media.map((item, i) => (
                  <button
                    key={item.id ?? item.url}
                    onClick={() => setActiveMedia(i)}
                    className={`relative h-20 w-20 flex-shrink-0 overflow-hidden border ${
                      i === activeMedia ? "border-gold" : "border-gold/20"
                    }`}
                  >
                    {item.media_type === "video" ? (
                      <>
                        <video src={item.url} className="h-full w-full object-cover" muted />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-gold">
                          <Play size={18} />
                        </span>
                      </>
                    ) : (
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold/70">
              {product.categories?.name ?? "KAPTAN Product"}
            </p>

            <h1 className="mt-2 font-serif text-3xl font-semibold text-white md:text-4xl">
              {product.name}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-white/60">
              {product.short_description}
            </p>

            {reviewSummary.count > 0 && (
              <a href="#reviews" className="mt-3 flex w-fit items-center gap-2 hover:opacity-80">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={
                        i < Math.round(reviewSummary.average) ? "fill-gold text-gold" : "text-gold/20"
                      }
                    />
                  ))}
                </div>
                <span className="text-xs text-white/50 underline-offset-2 hover:underline">
                  {reviewSummary.average.toFixed(1)} ({reviewSummary.count}{" "}
                  {reviewSummary.count === 1 ? "review" : "reviews"})
                </span>
              </a>
            )}

            <div className="mt-5 flex items-baseline gap-3">
              <span className="font-mono text-3xl font-bold text-gold">
                €{finalPrice.toFixed(2)}
              </span>

              {product.compare_at_price && product.compare_at_price > finalPrice && (
                <span className="font-mono text-lg text-white/40 line-through">
                  €{product.compare_at_price.toFixed(2)}
                </span>
              )}
            </div>

            <p className="mt-2 text-sm">
              {outOfStock ? (
                <span className="text-red-400">Out of stock</span>
              ) : (
                <span className="text-green-400">
                  In stock {product.stock_quantity !== null ? `(${product.stock_quantity} available)` : ""}
                </span>
              )}
            </p>

            {variants.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs uppercase tracking-wider text-gold/70">
                  {variants[0].variant_type}
                </h3>

                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id === variantId ? null : v.id)}
                      disabled={v.is_available === false}
                      className={`border px-3 py-1.5 text-sm ${
                        variantId === v.id
                          ? "border-gold bg-gold text-black"
                          : "border-gold/30 text-white hover:border-gold"
                      } disabled:opacity-40`}
                    >
                      {v.variant_value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="mb-2 text-xs uppercase tracking-wider text-gold/70">
                Number of units
              </h3>

              <div className="flex w-fit items-center border border-gold/30">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  className="px-3 py-2 text-gold disabled:opacity-30"
                >
                  <Minus size={16} />
                </button>

                <span className="min-w-[3ch] px-4 text-center text-white">{qty}</span>

                <button
                  onClick={() => setQty(Math.min(maxQty, qty + 1))}
                  disabled={qty >= maxQty}
                  className="px-3 py-2 text-gold disabled:opacity-30"
                >
                  <Plus size={16} />
                </button>
              </div>
              {qty >= maxQty && maxQty > 0 && (
                <p className="mt-1 text-xs text-gold-dark/70">Maximum available stock reached.</p>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                onClick={handleAdd}
                disabled={outOfStock}
                className="flex items-center justify-center gap-2 border border-gold bg-transparent py-3 text-sm font-bold uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-50"
              >
                <ShoppingBag size={16} />
                Add to Cart
              </button>

              <button
                onClick={handleBuyNow}
                disabled={outOfStock}
                className="flex items-center justify-center gap-2 bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
              >
                <CreditCard size={16} />
                Buy Now / Checkout
              </button>
            </div>

            <button
              onClick={handleWishlistToggle}
              disabled={wishlistLoading}
              className="mt-3 flex items-center gap-2 text-sm text-gold/80 hover:text-gold disabled:opacity-50"
            >
              <Heart size={16} className={wishlisted ? "fill-gold text-gold" : ""} />
              {wishlisted ? "Saved to wishlist" : "Save for later"}
            </button>

            <div className="mt-8 grid grid-cols-3 gap-3 border-y border-gold/10 py-4 text-xs">
              <div className="flex flex-col items-center gap-1 text-center text-white/70">
                <ShieldCheck size={20} className="text-gold" />Authentic
              </div>
              <div className="flex flex-col items-center gap-1 text-center text-white/70">
                <Truck size={20} className="text-gold" />Fast Shipping
              </div>
              <div className="flex flex-col items-center gap-1 text-center text-white/70">
                <Leaf size={20} className="text-gold" />Handcrafted
              </div>
            </div>

            {product.full_description && (
              <div className="mt-8">
                <h3 className="mb-2 font-serif text-lg text-white">Description & Details</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-white/70">
                  {product.full_description}
                </p>
              </div>
            )}

            <div className="mt-8 border border-gold/15 bg-[#1A1A1A] p-4">
              <h3 className="flex items-center gap-2 font-serif text-lg text-white">
                <Sparkles size={16} className="text-gold" />
                Care Instructions
              </h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/60">
                {CARE_INSTRUCTIONS.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-gold">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 border border-gold/15 bg-[#1A1A1A] p-4">
              <h3 className="font-serif text-lg text-white">Payment Methods</h3>
              <p className="mt-2 text-sm text-white/60">
                Cash on Delivery, Bank Transfer, Card, and PayPal are available at checkout.
              </p>
            </div>
          </div>
        </div>

        <div id="reviews" className="mt-16 scroll-mt-24 border-t border-gold/10 pt-12">
          <div className="flex flex-col gap-8 md:flex-row md:gap-12">
            <div className="md:w-72 md:flex-shrink-0">
              <h2 className="font-serif text-2xl font-bold text-white">Customer Reviews</h2>

              <div className="mt-4 flex items-end gap-3">
                <span className="font-serif text-5xl font-bold text-gold">
                  {reviewSummary.average.toFixed(1)}
                </span>
                <div className="pb-1">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={16}
                        className={
                          i < Math.round(reviewSummary.average) ? "fill-gold text-gold" : "text-gold/20"
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    Based on {reviewSummary.count} {reviewSummary.count === 1 ? "review" : "reviews"}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const starCount = reviewSummary.ratingCounts[star - 1] ?? 0;
                  const pct = reviewSummary.count ? (starCount / reviewSummary.count) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs text-white/60">
                      <span className="w-8">{star} star</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right text-white/40">{starCount}</span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={openReviewDialog}
                className="mt-6 flex w-full items-center justify-center gap-2 border border-gold px-4 py-2.5 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-black"
              >
                <PenLine size={16} />
                Write a Review
              </button>
            </div>

            <div className="flex-1 space-y-6">
              {reviews.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center border border-dashed border-gold/20 bg-[#1A1A1A] px-6 text-center">
                  <p className="text-white/60">No reviews yet.</p>
                  <p className="mt-1 text-sm text-white/40">Be the first to share your experience.</p>
                </div>
              ) : (
                reviews.map((r) => (
                  <div key={r.id} className="border-b border-gold/10 pb-6 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={13}
                            className={i < r.rating ? "fill-gold text-gold" : "text-gold/20"}
                          />
                        ))}
                      </div>
                      {r.isVerified && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
                          <BadgeCheck size={13} />
                          Verified Purchase
                        </span>
                      )}
                    </div>

                    {r.title && (
                      <h4 className="mt-2 font-serif text-base font-semibold text-white">{r.title}</h4>
                    )}

                    {r.body && (
                      <p className="mt-1.5 text-sm leading-relaxed text-white/70">{r.body}</p>
                    )}

                    <p className="mt-2 text-xs text-white/40">
                      {r.reviewerName} ·{" "}
                      {new Date(r.createdAt ?? "").toLocaleDateString("en-GB", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <div className="mb-8 text-center">
              <h2 className="font-serif text-2xl font-bold text-white md:text-3xl">
                You May Also Like
              </h2>
              <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p as never} />
              ))}
            </div>
          </div>
        )}

        {recentlyViewedProducts.length > 0 && (
          <div className="mt-16 border-t border-gold/10 pt-12">
            <h2 className="mb-8 font-serif text-xl font-semibold text-white">Recently Viewed</h2>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {recentlyViewedProducts.map((p) => (
                <ProductCard key={p.id} product={p as never} />
              ))}
            </div>
          </div>
        )}
      </section>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="border border-gold/20 bg-[#1A1A1A] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-white">Write a Review</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmitReview} className="space-y-4">
            <div>
              <span className="mb-2 block text-xs uppercase tracking-wider text-gold/70">
                Your Rating
              </span>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const value = i + 1;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setReviewRating(value)}
                      aria-label={`${value} star${value > 1 ? "s" : ""}`}
                      className="p-1"
                    >
                      <Star
                        size={26}
                        className={value <= reviewRating ? "fill-gold text-gold" : "text-gold/20"}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                Title (optional)
              </span>
              <input
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                maxLength={120}
                placeholder="Sum up your experience"
                className="w-full border border-gold/20 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gold"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                Review (optional)
              </span>
              <textarea
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="What did you like or dislike? How did you use it?"
                className="w-full border border-gold/20 bg-black p-3 text-sm text-white outline-none focus:border-gold"
              />
            </label>

            <button
              type="submit"
              disabled={submittingReview}
              className="w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
            >
              {submittingReview ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.short_description ?? product.full_description ?? undefined,
            image: media.filter((m) => m.media_type !== "video").map((m) => m.url),
            sku: product.id,
            brand: { "@type": "Brand", name: "KAPTAN" },
            ...((product.review_count ?? 0) > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: product.average_rating ?? 0,
                    reviewCount: product.review_count,
                  },
                }
              : {}),
            offers: {
              "@type": "Offer",
              url: `https://kaptangrp.com/products/${product.slug}`,
              priceCurrency: "EUR",
              price: finalPrice.toFixed(2),
              availability: outOfStock
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            },
          }),
        }}
      />
    </PageLayout>
  );
}