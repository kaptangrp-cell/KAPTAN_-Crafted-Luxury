import { useState } from "react";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShoppingBag, Minus, Plus, ShieldCheck, Truck, Leaf } from "lucide-react";
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

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(productQueryOptions(params.slug));
    } catch {
      throw notFound();
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — KAPTAN` },
    ],
  }),
  component: ProductDetailPage,
  notFoundComponent: () => (
    <PageLayout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-serif text-3xl text-white">Product not found</h1>
        <Link to="/products" className="mt-4 text-gold underline">Back to shop</Link>
      </div>
    </PageLayout>
  ),
  errorComponent: () => (
    <PageLayout>
      <div className="flex min-h-[60vh] items-center justify-center text-white/70">
        Could not load product.
      </div>
    </PageLayout>
  ),
});

function ProductDetailPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productQueryOptions(slug));
  const product = data?.product as never as {
    id: string; name: string; slug: string; price: number; compare_at_price: number | null;
    short_description: string | null; full_description: string | null;
    stock_quantity: number | null; tags: string[] | null;
    product_images: { id: string; url: string; alt_text: string | null }[];
    product_variants: { id: string; variant_type: string; variant_value: string; price_modifier: number | null; is_available: boolean | null }[];
    categories: { name: string; slug: string } | null;
  };

  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);

  const images = product.product_images?.length
    ? product.product_images
    : [{ id: "ph", url: "https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80", alt_text: product.name }];
  const variants = product.product_variants ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const finalPrice = product.price + (variant?.price_modifier ?? 0);
  const outOfStock = product.stock_quantity === 0;

  function handleAdd() {
    addItem(product as never, variant as never, qty, images[0].url);
    toast.success(`${product.name} added to cart`);
    openCart();
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
              <img src={images[activeImage].url} alt={images[activeImage].alt_text ?? product.name} className="h-full w-full object-cover" />
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImage(i)}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden border ${i === activeImage ? "border-gold" : "border-gold/20"}`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="font-serif text-3xl font-semibold text-white md:text-4xl">{product.name}</h1>
            <p className="mt-2 text-sm text-white/60">{product.short_description}</p>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="font-mono text-3xl font-bold text-gold">€{finalPrice.toFixed(2)}</span>
              {product.compare_at_price && product.compare_at_price > finalPrice && (
                <span className="font-mono text-lg text-white/40 line-through">€{product.compare_at_price.toFixed(2)}</span>
              )}
            </div>

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
                      className={`border px-3 py-1.5 text-sm ${variantId === v.id ? "border-gold bg-gold text-black" : "border-gold/30 text-white hover:border-gold"} disabled:opacity-40`}
                    >
                      {v.variant_value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <div className="flex items-center border border-gold/30">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2 text-gold"><Minus size={16} /></button>
                <span className="min-w-[2ch] px-3 text-center text-white">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="px-3 py-2 text-gold"><Plus size={16} /></button>
              </div>
              <button
                onClick={handleAdd}
                disabled={outOfStock}
                className="flex flex-1 items-center justify-center gap-2 bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
              >
                <ShoppingBag size={16} />
                {outOfStock ? "Out of Stock" : "Add to Cart"}
              </button>
            </div>

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
                <h3 className="mb-2 font-serif text-lg text-white">Description</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-white/70">{product.full_description}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
