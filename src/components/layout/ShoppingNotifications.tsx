import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Heart, ShoppingBag, ArrowRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMyWishlist } from "@/lib/wishlist.functions";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { useUIStore } from "@/stores/uiStore";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Price } from "@/components/common/Price";

export function ShoppingNotifications() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const fetchWishlist = useServerFn(getMyWishlist);
  const { data } = useQuery({
    queryKey: ["wishlist", user?.id],
    queryFn: () => fetchWishlist(),
    enabled: Boolean(user),
  });
  const count = user ? (data?.items.length ?? 0) : 0;
  const items = useCartStore((s) => s.items);
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  const [open, setOpen] = useState(false);
  const openCart = useUIStore((s) => s.openCart);
  return (
    <>
      <Link
        to="/wishlist"
        aria-label={t("buyer.wishlistCount", { count })}
        title={t("nav.wishlist")}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold transition-colors hover:bg-gold/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <Heart size={19} className={count ? "fill-gold/30" : ""} />
        {count > 0 && (
          <span
            key={count}
            aria-hidden="true"
            className="kaptan-pop absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-black"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("buyer.basketCount", { count: total })}
            title={t("buyer.finishOrder")}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gold transition-colors hover:bg-gold/10 ${total ? "border border-gold/50 bg-gold/10" : ""}`}
          >
            <ShoppingBag size={20} />
            {total > 0 && (
              <span
                key={total}
                aria-hidden="true"
                className="kaptan-pop absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-black"
              >
                {total > 99 ? "99+" : total}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={12}
          className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-gold/25 bg-black p-5 text-white shadow-xl"
          aria-label={t("buyer.finishOrder")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold">{t("nav.cart")}</p>
              <h2 className="mt-1 font-serif text-xl">
                {t(total ? "buyer.finishOrder" : "cart.empty")}
              </h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("buyer.close")}
              className="p-2 text-white/60"
            >
              <X size={16} />
            </button>
          </div>
          {total > 0 ? (
            <>
              <p className="mt-2 text-sm text-white/60">
                {t("buyer.basketReminder", { count: total })}
              </p>
              <div className="my-4 max-h-56 space-y-3 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <img
                      src={item.imageUrl || "/product-placeholder.svg"}
                      alt=""
                      className="h-14 w-14 rounded-lg bg-[#f3f0eb] object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.name}</p>
                      <p className="text-xs text-white/60">{item.variantLabel}</p>
                      <p className="mt-1 text-xs text-gold">
                        {item.quantity} × <Price amount={item.price} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-4 flex justify-between border-t border-gold/15 pt-3 text-sm">
                <span>{t("cart.subtotal")}</span>
                <Price
                  amount={items.reduce((sum, item) => sum + item.price * item.quantity, 0)}
                  className="font-medium text-gold"
                />
              </div>
              <Link
                to="/checkout"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-bold text-black"
              >
                {t("buyer.checkout")}
                <ArrowRight size={16} />
              </Link>
              <button
                onClick={() => {
                  setOpen(false);
                  openCart();
                }}
                className="mt-3 w-full py-2 text-sm text-gold"
              >
                {t("buyer.editBasket")}
              </button>
            </>
          ) : (
            <Link
              to="/products"
              onClick={() => setOpen(false)}
              className="mt-5 block rounded-full bg-gold px-4 py-3 text-center text-sm font-bold text-black"
            >
              {t("cart.shopNow")}
            </Link>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

export function CartReminderBar() {
  const { t } = useTranslation();
  const count = useCartStore((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!count || pathname.startsWith("/checkout") || pathname.startsWith("/admin")) return null;
  return (
    <div className="border-t border-gold/15 bg-gold/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-xs md:px-6">
        <p className="text-gold" aria-live="polite">
          {t("buyer.basketReminder", { count })}
        </p>
        <Link
          to="/checkout"
          className="flex shrink-0 items-center gap-1 font-semibold text-gold underline underline-offset-4"
        >
          {t("buyer.checkout")}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
