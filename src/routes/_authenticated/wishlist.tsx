import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getMyWishlist, removeFromWishlist } from "@/lib/wishlist.functions";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — KAPTAN" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getMyWishlist);
  const removeFn = useServerFn(removeFromWishlist);
  const { data, isLoading } = useQuery({ queryKey: ["wishlist"], queryFn: () => fetchFn() });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => removeFn({ data: { productId } }),
    onSuccess: () => {
      toast.success("Removed from wishlist");
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">My Wishlist</h1>
        <div className="mt-6 flex flex-wrap gap-4 border-b border-gold/10 pb-4 text-sm">
          <Link to="/profile" className="text-white/60 hover:text-gold">Profile</Link>
          <Link to="/orders" className="text-white/60 hover:text-gold">Orders</Link>
          <Link to="/wishlist" className="text-gold">Wishlist</Link>
        </div>

        {isLoading ? (
          <p className="mt-10 text-white/60">Loading…</p>
        ) : !data?.items.length ? (
          <div className="mt-12 flex flex-col items-center gap-4 border border-dashed border-gold/20 py-16 text-center">
            <p className="text-white/60">No saved items yet.</p>
            <Link to="/products" className="border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-black">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => {
              const p = item.products as never as { id: string; name: string; slug: string; price: number; product_images: { url: string; sort_order: number }[] };
              const img = p.product_images?.sort((a, b) => a.sort_order - b.sort_order)[0]?.url;
              return (
                <div key={item.id} className="group border border-gold/10 bg-[#1A1A1A]">
                  <Link to="/products/$slug" params={{ slug: p.slug }} className="block aspect-square overflow-hidden">
                    {img && <img src={img} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
                  </Link>
                  <div className="flex items-start justify-between gap-2 p-3">
                    <div>
                      <Link to="/products/$slug" params={{ slug: p.slug }} className="font-serif text-sm text-white hover:text-gold">
                        {p.name}
                      </Link>
                      <p className="mt-1 font-mono text-sm text-gold">€{Number(p.price).toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => removeMutation.mutate(p.id)}
                      className="text-white/40 hover:text-red-400"
                      aria-label="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageLayout>
  );
}
