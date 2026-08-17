import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/stores/cartStore";
import { PageLayout } from "@/components/layout/PageLayout";
import { Price } from "@/components/common/Price";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your Cart — KAPTAN" }] }),
  component: CartPage,
});

function CartPage() {
  const { t } = useTranslation();
  const { items, updateQuantity, removeItem, subtotal, clearCart } = useCartStore();
  const total = subtotal();
  const shipping = total > 50 ? 0 : 5.99;

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">{t("cart.title")}</h1>

        {items.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-4 border border-dashed border-gold/20 py-20 text-center">
            <p className="text-white/60">{t("cart.empty")}</p>
            <Link to="/products" className="border border-gold px-4 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-black">
              {t("cart.continueShopping")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 border border-gold/10 bg-[#1A1A1A] p-4">
                  <img src={item.imageUrl} alt={item.name} className="h-24 w-24 object-cover" />
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <h3 className="font-serif text-white">{item.name}</h3>
                      {item.variantLabel && <p className="text-xs text-gold-dark">{item.variantLabel}</p>}
                      <p className="mt-1 font-mono text-gold"><Price amount={item.price} /></p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-gold/30">
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-2 py-1 text-gold"><Minus size={14} /></button>
                        <span className="px-3 text-white">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-2 py-1 text-gold"><Plus size={14} /></button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-white/40 hover:text-red-400">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={clearCart} className="text-xs text-white/40 hover:text-red-400">{t("cart.clearCart")}</button>
            </div>

            <aside className="h-fit border border-gold/20 bg-[#1A1A1A] p-6">
              <h2 className="font-serif text-lg text-white">{t("cart.orderSummary")}</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-white/70"><dt>{t("cart.subtotal")}</dt><dd className="font-mono"><Price amount={total} /></dd></div>
                <div className="flex justify-between text-white/70"><dt>{t("cart.shipping")}</dt><dd className="font-mono">{shipping === 0 ? t("cart.free") : <Price amount={shipping} />}</dd></div>
                <div className="mt-3 flex justify-between border-t border-gold/10 pt-3 text-base text-white"><dt>{t("cart.total")}</dt><dd className="font-mono text-gold"><Price amount={total + shipping} /></dd></div>
              </dl>
              <Link
                to="/checkout"
                className="mt-6 block w-full bg-gold py-3 text-center text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid"
              >
                {t("cart.proceedToCheckout")}
              </Link>
            </aside>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
