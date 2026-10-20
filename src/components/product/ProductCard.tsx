import { productBenefitKey } from "@/lib/brand-product";
import { PhotoCarousel } from "@/components/media/PhotoCarousel";
import { translateCatalogText } from "@/lib/catalog-translation";
import { useState } from "react";
import { optionParts } from "@/lib/product-options";
import { colorHex, galleryForColor } from "@/lib/product-media";
import { CatalogText } from "@/components/common/CatalogText";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, ShoppingBag, Star, Check } from "lucide-react";
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
          price_modifier?: number | null;
          stock_quantity?: number | null;
        }[]
      | null;
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const addItem = useCartStore((s) => s.addItem);
  const user = useAuthStore((s) => s.user);
  const toggleWishlistFn = useServerFn(toggleWishlist);

  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingWishlist, setSavingWishlist] = useState(false);
  const [color, setColor] = useState("");
  const [optionId, setOptionId] = useState("");
  const colors = [
    ...new Set(
      (product.product_variants ?? [])
        .filter((v) => v.is_available !== false)
        .map(
          (v) =>
            optionParts({
              variant_type: v.variant_type ?? "",
              variant_value: v.variant_value ?? "",
            }).color,
        )
        .filter((v): v is string => !!v),
    ),
  ];
  const photos = galleryForColor(
    product.product_images ?? [],
    product.specifications,
    color,
  ).filter((image) => image.media_type !== "video");
  const imageUrl = photos[0]?.url ?? "/product-placeholder.svg";

  const selectedOptions = (product.product_variants ?? []).filter(
    (v) =>
      v.is_available !== false &&
      (!color ||
        optionParts({ variant_type: v.variant_type ?? "", variant_value: v.variant_value ?? "" })
          .color === color),
  );
  const purchasable = selectedOptions.filter((v) => v.stock_quantity !== 0);
  const quickOption =
    purchasable.find((v) => v.id === optionId) ??
    (purchasable.length === 1 ? purchasable[0] : null);
  const needsOption = !!product.product_variants?.length && !quickOption;
  const displayPrice =
    Number(product.price) +
    (quickOption
      ? Number(quickOption.price_modifier ?? 0)
      : selectedOptions.length
        ? Math.min(...selectedOptions.map((v) => Number(v.price_modifier ?? 0)))
        : 0);

  function openProduct() {
    navigate({
      to: "/products/$slug",
      params: { slug: product.slug },
    });
  }

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation();
    if (needsOption) {
      openProduct();
      return;
    }
    addItem(product, quickOption as never, 1, imageUrl);
    setAdded(true);
    toast.success(t("products.addedToCartToast", { name: product.name }));
  }

  async function handleWishlist(e: React.MouseEvent) {
    e.stopPropagation();

    if (!user) {
      toast.error(t("products.signInToWishlistToast"));
      return;
    }

    if (savingWishlist) return;
    setSavingWishlist(true);
    try {
      const result = await toggleWishlistFn({
        data: { productId: product.id },
      });

      setSaved(result.saved);
      toast.success(
        result.saved ? t("products.addedToWishlistToast") : t("products.removedFromWishlistToast"),
      );
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("products.wishlistFailedToast"));
    } finally {
      setSavingWishlist(false);
    }
  }

  return (
    <div className="kaptan-product-card group relative flex h-full flex-col overflow-hidden rounded-xl border border-gold/15 bg-[#1A1A1A] transition-colors duration-300 hover:border-gold/40">
      <PhotoCarousel
        key={`${product.id}-${color}`}
        slides={photos.map((image) => ({
          url: image.url,
          alt: translateCatalogText(product.name, i18n.language),
          slug: product.slug,
        }))}
      >
        <button
          disabled={savingWishlist}
          onClick={handleWishlist}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-black/80 text-gold transition-colors hover:bg-gold hover:text-black"
          aria-label={t("products.wishlistAriaLabel")}
        >
          <Heart key={String(saved)} size={17} className={saved ? "kaptan-pop fill-gold" : ""} />
        </button>
      </PhotoCarousel>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        {!!colors.length && (
          <div className="mb-3 flex flex-wrap items-center gap-2" aria-label={t("options.color")}>
            {colors.map((value) => (
              <button
                key={value}
                type="button"
                title={translateCatalogText(value, i18n.language)}
                aria-label={translateCatalogText(value, i18n.language)}
                aria-pressed={color === value}
                onClick={() => {
                  setColor(value);
                  setOptionId("");
                }}
                className={`h-8 w-8 rounded-full border-2 p-0.5 ${color === value ? "border-gold" : "border-white/30"}`}
              >
                <span
                  className="block h-full w-full rounded-full"
                  style={{ background: colorHex(value) }}
                />
              </button>
            ))}
            <span className="text-xs text-white/65">
              {color ? (
                <CatalogText text={color} />
              ) : (
                t("catalog.colorCount", { count: colors.length })
              )}
            </span>
          </div>
        )}
        <h3 className="font-serif text-base font-medium text-white transition-colors group-hover:text-gold">
          <Link to="/products/$slug" params={{ slug: product.slug }}>
            <CatalogText text={product.name} />
          </Link>
        </h3>

        <p className="mt-1 line-clamp-2 text-sm text-white/70">
          {t(productBenefitKey(product.name))}
        </p>

        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          hash="reviews"
          className="mt-3 flex items-center gap-1.5 text-xs text-white/70"
        >
          <Star
            size={14}
            className={product.review_count ? "fill-gold text-gold" : "text-white/40"}
          />
          {product.review_count
            ? `${Number(product.average_rating ?? 0).toFixed(1)} (${product.review_count})`
            : t("catalog.noReviews")}
        </Link>
        <ProductFacts
          specifications={product.specifications}
          variants={product.product_variants}
          compact
        />

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
          <Price amount={displayPrice} className="font-mono text-lg font-bold text-gold" />

          {product.compare_at_price != null && product.compare_at_price > displayPrice && (
            <>
              <Price
                amount={product.compare_at_price}
                className="text-sm text-white/45 line-through"
              />
              <span className="rounded bg-gold/15 px-2 py-1 text-xs text-gold">
                −{Math.round((1 - displayPrice / product.compare_at_price) * 100)}%
              </span>
            </>
          )}
          {(product.stock_quantity ?? 0) <= (product.low_stock_threshold ?? 5) &&
            (product.stock_quantity ?? 0) > 0 && (
              <span className="text-xs text-amber-400">{t("products.lowStock")}</span>
            )}

          {(product.stock_quantity ?? 0) === 0 && (
            <span className="text-xs text-red-400">{t("products.outOfStock")}</span>
          )}
        </div>

        {product.stock_quantity > (product.low_stock_threshold ?? 5) && (
          <p className="mt-2 text-xs text-green-400">{t("pdp.inStock")}</p>
        )}
        <Link to="/shipping" className="mt-3 text-xs text-white/55 hover:text-gold">
          {t("catalog.delivery")}
        </Link>
        {!!product.product_variants?.length && (
          <label className="mt-3 text-xs text-white/70">
            {t("options.choose")}
            <select
              aria-label={`${t("options.choose")}: ${translateCatalogText(product.name, i18n.language)}`}
              value={quickOption?.id ?? ""}
              onChange={(e) => setOptionId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-gold/30 bg-black px-3 text-sm text-white"
            >
              <option value="">{t("options.choose")}</option>
              {purchasable.map((v) => (
                <option key={v.id} value={v.id}>
                  {translateCatalogText(v.variant_value ?? "", i18n.language)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={handleAddToCart}
          disabled={!product.is_available || product.stock_quantity <= 0}
          className="mt-4 flex w-full rounded-full items-center justify-center gap-2 bg-gold py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
        >
          {added ? (
            <Check size={16} className="kaptan-pop" onAnimationEnd={() => setAdded(false)} />
          ) : (
            <ShoppingBag size={16} />
          )}
          {!product.is_available || product.stock_quantity <= 0
            ? t("products.outOfStock")
            : t("products.addToCart")}
        </button>
        <button
          onClick={() => {
            if (needsOption) {
              openProduct();
              return;
            }
            addItem(product, quickOption as never, 1, imageUrl);
            navigate({ to: "/checkout" });
          }}
          disabled={!product.is_available || product.stock_quantity <= 0}
          className="mt-2 flex min-h-10 w-full items-center justify-center rounded-full border border-gold/50 text-sm font-semibold text-gold hover:bg-gold/10 disabled:opacity-50"
        >
          {t("buyer.checkout")}
        </button>
        {needsOption && (
          <p className="mt-2 text-center text-xs text-white/60">
            {i18n.language.startsWith("de")
              ? "Bitte oben eine Variante wählen."
              : "Choose an option above."}
          </p>
        )}
      </div>
    </div>
  );
}
