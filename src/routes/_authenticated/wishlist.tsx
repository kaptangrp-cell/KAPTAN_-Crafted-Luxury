import { AccountHeader } from "@/components/account/AccountHeader";
import { CatalogText } from "@/components/common/CatalogText";
import { useAuthStore } from "@/stores/authStore";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Heart, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getMyWishlist, removeFromWishlist } from "@/lib/wishlist.functions";
import { PageLayout } from "@/components/layout/PageLayout";
import { Price } from "@/components/common/Price";

export const Route = createFileRoute("/_authenticated/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — KAPTAN" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const fetchFn = useServerFn(getMyWishlist);
  const removeFn = useServerFn(removeFromWishlist);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wishlist", userId],
    enabled: Boolean(userId),
    queryFn: () => fetchFn(),
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => removeFn({ data: { productId } }),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: () => {
      toast.success(t("wishlist.removedToast"));
      qc.invalidateQueries({ queryKey: ["wishlist", userId] });
    },
  });

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <AccountHeader active="wishlist" />

        {isLoading ? (
          <p className="mt-10 text-white/60">{t("account.loading")}</p>
        ) : isError ? (
          <div role="alert" className="rounded-2xl border border-gold/20 p-6 text-white/70">
            <p>{t("accountStyle.loadFailed")}</p>
            <button onClick={() => void refetch()} className="mt-3 text-gold">
              {t("orders.retry")}
            </button>
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold/15 bg-[#0D0D0D] px-5 py-16 text-center">
            <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
              <Heart size={27} strokeWidth={1} />
            </span>
            <p className="font-serif text-xl text-white">{t("wishlist.empty")}</p>
            <Link
              to="/products"
              className="mt-2 rounded-full border border-gold/40 px-6 py-3 text-sm text-gold transition-colors hover:bg-gold hover:text-black"
            >
              {t("wishlist.browseProducts")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => {
              const p = item.products as never as {
                id: string;
                name: string;
                slug: string;
                price: number;
                product_images: { url: string; sort_order: number; media_type?: string }[];
              };
              const img =
                [...(p.product_images ?? [])]
                  .filter((image) => image.media_type !== "video")
                  .sort((a, b) => a.sort_order - b.sort_order)[0]?.url ??
                "/product-placeholder.svg";
              return (
                <div
                  key={item.id}
                  className="group overflow-hidden rounded-2xl border border-gold/15 bg-[#0D0D0D] transition-colors hover:border-gold/40"
                >
                  <Link
                    to="/products/$slug"
                    params={{ slug: p.slug }}
                    className="block aspect-[4/3] overflow-hidden bg-[#f3f0eb]"
                  >
                    {img && (
                      <img
                        src={img}
                        alt={p.name}
                        className="h-full w-full object-contain p-4 transition-transform duration-500 motion-safe:group-hover:scale-105"
                      />
                    )}
                  </Link>
                  <div className="flex items-start justify-between gap-2 p-5">
                    <div>
                      <Link
                        to="/products/$slug"
                        params={{ slug: p.slug }}
                        className="font-serif text-lg text-white hover:text-gold"
                      >
                        <CatalogText text={p.name} />
                      </Link>
                      <p className="mt-1 font-mono text-sm text-gold">
                        <Price amount={Number(p.price)} />
                      </p>
                    </div>
                    <button
                      onClick={() => removeMutation.mutate(p.id)}
                      disabled={removeMutation.isPending}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/15 text-white/40 transition-colors hover:border-red-400/40 hover:text-red-400 disabled:opacity-40"
                      aria-label={t("wishlist.removeAriaLabel")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <Link
                    to="/products/$slug"
                    params={{ slug: p.slug }}
                    className="mx-5 mb-5 flex items-center justify-between border-t border-gold/10 pt-4 text-xs font-medium text-gold"
                  >
                    {t("accountStyle.viewProduct")}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageLayout>
  );
}
