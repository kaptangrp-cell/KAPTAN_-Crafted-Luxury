import { useState } from "react";
import { createFileRoute, notFound, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { toast } from "sonner";
import { getProductBySlug } from "@/lib/products.functions";
import { PageLayout } from "@/components/layout/PageLayout";
import { useCartStore } from "@/stores/cartStore";
import { useUIStore } from "@/stores/uiStore";

function productQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
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

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);

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

  function handleAdd() {
    addItem(product as never, variant as never, qty, firstImage.url);
    toast.success(`${product.name} added to cart`);
    openCart();
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
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2 text-gold">
                  <Minus size={16} />
                </button>

                <span className="min-w-[3ch] px-4 text-center text-white">{qty}</span>

                <button onClick={() => setQty(qty + 1)} className="px-3 py-2 text-gold">
                  <Plus size={16} />
                </button>
              </div>
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
              onClick={() => toast.info("Use the heart icon on product cards to save wishlist items.")}
              className="mt-3 flex items-center gap-2 text-sm text-gold/80 hover:text-gold"
            >
              <Heart size={16} />
              Save for later
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
              <h3 className="font-serif text-lg text-white">Payment Methods</h3>
              <p className="mt-2 text-sm text-white/60">
                You can choose Cash on Delivery or Bank Transfer on the checkout page.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}