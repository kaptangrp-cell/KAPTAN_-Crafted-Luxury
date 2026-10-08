import { CatalogText } from "@/components/common/CatalogText";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { toggleWishlist } from "@/lib/wishlist.functions";
import { Price } from "@/components/common/Price";
import { ProductFacts } from "./ProductFacts";
import type { Product } from "@/types";

interface ProductCardProps {
  product: Product & {
    categories?: { name: string; slug: string } | null;
    product_images?: { url: string; media_type?: string; sort_order?: number | null }[] | null;
    product_variants?:
      | {
          id: string;
          variant_type?: string;
          variant_value?: string;
          is_available?: boolean | null;
        }[]
      | null;
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const addItem = useCartStore((s) => s.addItem);
  const user = useAuthStore((s) => s.user);
  const toggleWishlistFn = useServerFn(toggleWishlist);

  const imageUrl =
    product.product_images
      ?.filter((image) => image.media_type !== "video")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.url ??
    "/product-placeholder.svg";

  const categoryName = product.categories?.name ?? t("products.defaultCategory");

  function openProduct() {
    navigate({
      to: "/products/$slug",
      params: { slug: product.slug },
    });
  }

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation();
    if (product.product_variants?.length) {
      openProduct();
      return;
    }
    addItem(product, null, 1, imageUrl);
    toast.success(t("products.addedToCartToast", { name: product.name }));
  }

  async function handleWishlist(e: React.MouseEvent) {
    e.stopPropagation();

    if (!user) {
      toast.error(t("products.signInToWishlistToast"));
      return;
    }

    try {
      const result = await toggleWishlistFn({
        data: { productId: product.id },
      });

      toast.success(
        result.saved ? t("products.addedToWishlistToast") : t("products.removedFromWishlistToast"),
      );
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("products.wishlistFailedToast"));
    }
  }

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-gold/15 bg-[#1A1A1A] transition-colors duration-300 hover:border-gold/40">
      <div className="media-hero relative block aspect-square overflow-hidden bg-[#f3f0eb]">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="block h-full"
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-4 transition-transform duration-500 motion-safe:group-hover:scale-105"
          />
        </Link>

        <span className="absolute bottom-2 left-2 max-w-[90%] rounded-full bg-black/80 px-2.5 py-1 text-[10px] font-medium text-white">
          <CatalogText text={categoryName} />
        </span>

        <button
          onClick={handleWishlist}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-black/80 text-gold transition-colors hover:bg-gold hover:text-black"
          aria-label={t("products.wishlistAriaLabel")}
        >
          <Heart size={17} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="font-serif text-base font-medium text-white transition-colors group-hover:text-gold">
          <Link to="/products/$slug" params={{ slug: product.slug }}>
            <CatalogText text={product.name} />
          </Link>
        </h3>

        <p className="mt-1 line-clamp-1 text-sm text-white/70">
          <CatalogText text={product.short_description} />
        </p>

        <ProductFacts
          specifications={product.specifications}
          variants={product.product_variants}
          compact
        />

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
          <Price amount={product.price} className="font-mono text-lg font-bold text-gold" />

          {(product.stock_quantity ?? 0) <= 5 && (product.stock_quantity ?? 0) > 0 && (
            <span className="text-xs text-amber-400">{t("products.lowStock")}</span>
          )}

          {(product.stock_quantity ?? 0) === 0 && (
            <span className="text-xs text-red-400">{t("products.outOfStock")}</span>
          )}
        </div>

        <button
          onClick={handleAddToCart}
          disabled={!product.is_available || product.stock_quantity <= 0}
          className="mt-4 flex w-full items-center justify-center gap-2 bg-gold py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
        >
          <ShoppingBag size={16} />
          {!product.is_available || product.stock_quantity <= 0
            ? t("products.outOfStock")
            : t(product.product_variants?.length ? "products.chooseOptions" : "products.addToCart")}
        </button>
      </div>
    </div>
  );
}
