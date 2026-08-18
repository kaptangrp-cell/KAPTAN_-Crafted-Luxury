import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Lock, Truck, Minus, Plus, X, Pencil } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { PageLayout } from "@/components/layout/PageLayout";
import { createOrder } from "@/lib/orders.functions";
import {
  createStripeCheckoutSession,
  createPaypalCheckoutOrder,
  createStripePaymentIntentForOrder,
  confirmStripeOrderPayment,
} from "@/lib/payments.functions";
import { getMyAddresses, saveAddress, rememberPaymentMethod } from "@/lib/profile.functions";
import { getStripeJs } from "@/lib/payments/stripe-client";
import { useDisplayPrice } from "@/hooks/useCurrency";
import { COUNTRIES } from "@/lib/countries";

const STRIPE_ENABLED = Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const PAYPAL_ENABLED = Boolean(import.meta.env.VITE_PAYPAL_CLIENT_ID);

type ExpressCheckoutItem = { productId: string; variantId: string | null; quantity: number };

/**
 * Apple Pay / Google Pay "express checkout" button, rendered via Stripe's
 * PaymentRequest API. Only appears when the browser/device actually
 * supports a wallet (Stripe's canMakePayment() check) — there's no
 * fallback fake button. The wallet sheet collects name/email/phone/
 * shipping address itself, so a real order is created from that data,
 * a PaymentIntent is confirmed client-side, and the server verifies the
 * PaymentIntent before marking the order paid.
 */
function ExpressCheckout({
  amount,
  shippingAmount,
  items,
  onOrderPlaced,
}: {
  amount: number;
  shippingAmount: number;
  items: ExpressCheckoutItem[];
  onOrderPlaced: (orderId: string) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);
  const createOrderFn = useServerFn(createOrder);
  const createIntentFn = useServerFn(createStripePaymentIntentForOrder);
  const confirmPaymentFn = useServerFn(confirmStripeOrderPayment);

  useEffect(() => {
    if (!STRIPE_ENABLED || amount <= 0 || items.length === 0) return;

    let cancelled = false;

    (async () => {
      const stripe = await getStripeJs();
      if (!stripe || !containerRef.current || cancelled) return;

      const paymentRequest = stripe.paymentRequest({
        country: "DE",
        currency: "eur",
        total: { label: "KAPTAN", amount: Math.round(amount * 100) },
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true,
        requestShipping: true,
        shippingOptions: [
          {
            id: "standard",
            label: shippingAmount === 0 ? t("checkout.freeShippingLabel") : t("checkout.standardShippingLabel"),
            detail: t("checkout.standardShippingDetail"),
            amount: Math.round(shippingAmount * 100),
          },
        ],
      });

      const canPay = await paymentRequest.canMakePayment();
      if (!canPay || cancelled) return;

      setAvailable(true);

      const elements = stripe.elements();
      const prButton = elements.create("paymentRequestButton", {
        paymentRequest,
        style: { paymentRequestButton: { theme: "dark", height: "48px" } },
      });
      prButton.mount(containerRef.current);

      paymentRequest.on("paymentmethod", async (ev) => {
        try {
          const shippingAddr = ev.shippingAddress;

          const { orderId } = await createOrderFn({
            data: {
              user_id: null,
              customer_name: ev.payerName ?? "",
              customer_email: ev.payerEmail ?? "",
              customer_phone: ev.payerPhone ?? "",
              shipping_address: {
                full_name: ev.payerName ?? "",
                phone: ev.payerPhone ?? "",
                line1: shippingAddr?.addressLine?.[0] ?? "",
                line2: shippingAddr?.addressLine?.[1] || null,
                city: shippingAddr?.city ?? "",
                state: shippingAddr?.region ?? null,
                postal_code: shippingAddr?.postalCode ?? "",
                country: shippingAddr?.country ?? "DE",
              },
              items,
              payment_method: "card",
              notes: null,
            },
          });

          const { clientSecret, paymentIntentId } = await createIntentFn({ data: { orderId } });

          const confirmResult = await stripe.confirmCardPayment(
            clientSecret,
            { payment_method: ev.paymentMethod.id },
            { handleActions: false },
          );

          if (confirmResult.error) {
            ev.complete("fail");
            toast.error(confirmResult.error.message ?? t("checkout.paymentFailedToast"));
            return;
          }

          ev.complete("success");

          if (confirmResult.paymentIntent?.status === "requires_action") {
            const actionResult = await stripe.confirmCardPayment(clientSecret);
            if (actionResult.error) {
              toast.error(actionResult.error.message ?? t("checkout.paymentCouldNotComplete"));
              return;
            }
          }

          await confirmPaymentFn({ data: { orderId, paymentIntentId } });
          onOrderPlaced(orderId);
        } catch (err) {
          ev.complete("fail");
          toast.error(err instanceof Error ? err.message : t("checkout.paymentFailedToast"));
        }
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, shippingAmount, JSON.stringify(items)]);

  if (!STRIPE_ENABLED || !available) return null;

  return (
    <div className="mb-6">
      <div ref={containerRef} />
      <div className="my-4 flex items-center gap-3 text-white/30">
        <span className="h-px flex-1 bg-gold/10" />
        <span className="text-[11px] uppercase tracking-wider">{t("checkout.expressCheckoutDivider")}</span>
        <span className="h-px flex-1 bg-gold/10" />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — KAPTAN" }] }),
  component: CheckoutPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYMENT_METHODS = ["cod", "bank_transfer", "card", "paypal"] as const;

function CheckoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items, subtotal, removeItem, updateQuantity, clearCart } = useCartStore();
  const { user, profile } = useAuthStore();
  const createOrderFn = useServerFn(createOrder);
  const createStripeSessionFn = useServerFn(createStripeCheckoutSession);
  const createPaypalOrderFn = useServerFn(createPaypalCheckoutOrder);
  const getAddressesFn = useServerFn(getMyAddresses);
  const saveAddressFn = useServerFn(saveAddress);
  const rememberPaymentMethodFn = useServerFn(rememberPaymentMethod);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const total = subtotal();
  const shipping = total > 50 ? 0 : 5.99;
  const grandTotal = total + shipping;
  const grandTotalEstimate = useDisplayPrice(grandTotal);

  const { data: addressesData } = useQuery({
    queryKey: ["my-addresses"],
    queryFn: () => getAddressesFn(),
    enabled: Boolean(user),
  });
  const addresses = addressesData?.addresses ?? [];

  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [saveThisAddress, setSaveThisAddress] = useState(false);
  const prefilledDefault = useRef(false);

  const savedPaymentMethod = profile?.last_payment_method;
  const initialPaymentMethod =
    savedPaymentMethod === "card" || savedPaymentMethod === "paypal" ? savedPaymentMethod : "card";

  const [form, setForm] = useState({
    customer_name: profile?.full_name ?? "",
    customer_email: user?.email ?? "",
    customer_phone: profile?.phone ?? "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "DE",
    payment_method: initialPaymentMethod as (typeof PAYMENT_METHODS)[number],
    notes: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k as string]) return e;
      const next = { ...e };
      delete next[k as string];
      return next;
    });
  }

  // Prefill from the customer's default saved address the first time their
  // address book loads, but only if they haven't already typed anything.
  useEffect(() => {
    if (prefilledDefault.current || addresses.length === 0) return;
    prefilledDefault.current = true;

    const def = addresses.find((a) => a.is_default) ?? addresses[0];
    if (!def) return;

    setSelectedAddressId(def.id);
    setForm((f) => ({
      ...f,
      customer_name: f.customer_name || def.full_name,
      customer_phone: f.customer_phone || def.phone || "",
      line1: def.line1,
      line2: def.line2 ?? "",
      city: def.city,
      state: def.state ?? "",
      postal_code: def.postal_code,
      country: def.country,
    }));
  }, [addresses]);

  function selectAddress(id: string) {
    setSelectedAddressId(id);

    if (id === "new") {
      setForm((f) => ({ ...f, line1: "", line2: "", city: "", state: "", postal_code: "" }));
      return;
    }

    const addr = addresses.find((a) => a.id === id);
    if (!addr) return;

    setForm((f) => ({
      ...f,
      customer_name: addr.full_name,
      customer_phone: addr.phone || f.customer_phone,
      line1: addr.line1,
      line2: addr.line2 ?? "",
      city: addr.city,
      state: addr.state ?? "",
      postal_code: addr.postal_code,
      country: addr.country,
    }));
    setErrors({});
  }

  function validate() {
    const next: Record<string, string> = {};

    if (!form.customer_name.trim()) next.customer_name = t("checkout.errorRequired");
    if (!form.customer_email.trim()) next.customer_email = t("checkout.errorRequired");
    else if (!EMAIL_RE.test(form.customer_email.trim())) next.customer_email = t("checkout.errorInvalidEmail");
    if (!form.customer_phone.trim()) next.customer_phone = t("checkout.errorRequired");
    if (!form.line1.trim()) next.line1 = t("checkout.errorRequired");
    if (!form.city.trim()) next.city = t("checkout.errorRequired");
    if (!form.postal_code.trim()) next.postal_code = t("checkout.errorRequired");
    if (!form.country.trim()) next.country = t("checkout.errorRequired");

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (items.length === 0) {
      toast.error(t("checkout.emptyCartError"));
      return;
    }

    if (!validate()) {
      toast.error(t("checkout.errorFixFields"));
      return;
    }

    setSubmitting(true);

    try {
      const { orderId, orderNumber } = await createOrderFn({
        data: {
          user_id: user?.id ?? null,
          customer_name: form.customer_name,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
          shipping_address: {
            full_name: form.customer_name,
            phone: form.customer_phone,
            line1: form.line1,
            line2: form.line2 || null,
            city: form.city,
            state: form.state || null,
            postal_code: form.postal_code,
            country: form.country,
          },
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          payment_method: form.payment_method,
          notes: form.notes || null,
        },
      });

      // Fire-and-forget account conveniences — never block the order on these.
      if (user) {
        rememberPaymentMethodFn({ data: { payment_method: form.payment_method } }).catch(() => {});

        if (saveThisAddress && selectedAddressId === "new") {
          saveAddressFn({
            data: {
              full_name: form.customer_name,
              phone: form.customer_phone,
              line1: form.line1,
              line2: form.line2 || null,
              city: form.city,
              state: form.state || null,
              postal_code: form.postal_code,
              country: form.country,
              is_default: addresses.length === 0,
            },
          }).catch(() => {});
        }
      }

      if (form.payment_method === "card") {
        const { url } = await createStripeSessionFn({
          data: { orderId, origin: window.location.origin },
        });
        clearCart();
        window.location.href = url;
        return;
      }

      if (form.payment_method === "paypal") {
        const { url } = await createPaypalOrderFn({
          data: { orderId, origin: window.location.origin },
        });
        clearCart();
        window.location.href = url;
        return;
      }

      clearCart();
      toast.success(t("checkout.orderPlacedToast", { orderNumber }));
      navigate({ to: "/orders/$id", params: { id: orderId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("checkout.orderFailedToast"));
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <PageLayout>
        <section className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-serif text-3xl text-white">{t("checkout.emptyTitle")}</h1>
          <Link
            to="/products"
            className="mt-6 inline-block border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-black"
          >
            {t("cart.continueShopping")}
          </Link>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">{t("checkout.title")}</h1>

        <div className="mt-8">
          <ExpressCheckout
            amount={grandTotal}
            shippingAmount={shipping}
            items={items.map((i) => ({
              productId: i.productId,
              variantId: i.variantId,
              quantity: i.quantity,
            }))}
            onOrderPlaced={(orderId) => {
              clearCart();
              toast.success(t("checkout.orderPlacedGenericToast"));
              navigate({ to: "/orders/$id", params: { id: orderId } });
            }}
          />
        </div>

        <form onSubmit={handleSubmit} className="grid gap-8 md:grid-cols-[1fr_360px]">
          <div className="order-2 space-y-8 md:order-none">
            <section>
              <h2 className="font-serif text-lg text-gold">{t("checkout.contactSection")}</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field
                  label={t("checkout.fullName")}
                  value={form.customer_name}
                  onChange={(v) => set("customer_name", v)}
                  autoComplete="name"
                  error={errors.customer_name}
                  required
                />
                <Field
                  label={t("checkout.email")}
                  type="email"
                  value={form.customer_email}
                  onChange={(v) => set("customer_email", v)}
                  autoComplete="email"
                  error={errors.customer_email}
                  required
                />
                <Field
                  label={t("checkout.phone")}
                  type="tel"
                  value={form.customer_phone}
                  onChange={(v) => set("customer_phone", v)}
                  autoComplete="tel"
                  error={errors.customer_phone}
                  required
                />
              </div>
            </section>

            <section>
              <h2 className="font-serif text-lg text-gold">{t("checkout.shippingAddressSection")}</h2>

              {user && addresses.length > 0 && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                    {t("checkout.shipToLabel")}
                  </span>
                  <select
                    value={selectedAddressId}
                    onChange={(e) => selectAddress(e.target.value)}
                    className="w-full border border-gold/20 bg-[#1A1A1A] px-3 py-2 text-sm text-white outline-none focus:border-gold"
                  >
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#1A1A1A]">
                        {(a.label || t("checkout.savedAddressFallbackLabel"))}
                        {" — "}
                        {a.line1}, {a.city}
                      </option>
                    ))}
                    <option value="new" className="bg-[#1A1A1A]">
                      {t("checkout.newAddressOption")}
                    </option>
                  </select>
                </label>
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field
                  className="md:col-span-2"
                  label={t("checkout.addressLine1")}
                  value={form.line1}
                  onChange={(v) => set("line1", v)}
                  autoComplete="address-line1"
                  error={errors.line1}
                  required
                />
                <Field
                  className="md:col-span-2"
                  label={t("checkout.addressLine2")}
                  value={form.line2}
                  onChange={(v) => set("line2", v)}
                  autoComplete="address-line2"
                />
                <Field
                  label={t("checkout.city")}
                  value={form.city}
                  onChange={(v) => set("city", v)}
                  autoComplete="address-level2"
                  error={errors.city}
                  required
                />
                <Field
                  label={t("checkout.stateRegion")}
                  value={form.state}
                  onChange={(v) => set("state", v)}
                  autoComplete="address-level1"
                />
                <Field
                  label={t("checkout.postalCode")}
                  value={form.postal_code}
                  onChange={(v) => set("postal_code", v)}
                  autoComplete="postal-code"
                  error={errors.postal_code}
                  required
                />
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                    {t("checkout.country")}
                  </span>
                  <select
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    autoComplete="country"
                    className={`w-full border bg-[#1A1A1A] px-3 py-2 text-sm text-white outline-none focus:border-gold ${
                      errors.country ? "border-red-500" : "border-gold/20"
                    }`}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code} className="bg-[#1A1A1A]">
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.country && <p className="mt-1 text-xs text-red-400">{errors.country}</p>}
                </label>
              </div>

              {user && selectedAddressId === "new" && (
                <label className="mt-3 flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={saveThisAddress}
                    onChange={(e) => setSaveThisAddress(e.target.checked)}
                    className="accent-gold"
                  />
                  {t("checkout.saveAddressLabel")}
                </label>
              )}
            </section>

            <section>
              <h2 className="font-serif text-lg text-gold">{t("checkout.paymentMethodSection")}</h2>
              <div className="mt-3 space-y-2">
                {[
                  {
                    v: "card",
                    label: t("checkout.cardLabel"),
                    desc: STRIPE_ENABLED
                      ? t("checkout.cardDescEnabled")
                      : t("checkout.cardDescComingSoon"),
                    disabled: !STRIPE_ENABLED,
                  },
                  {
                    v: "paypal",
                    label: t("checkout.paypalLabel"),
                    desc: PAYPAL_ENABLED
                      ? t("checkout.paypalDescEnabled")
                      : t("checkout.paypalDescComingSoon"),
                    disabled: !PAYPAL_ENABLED,
                  },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex items-start gap-3 border p-3 ${
                      opt.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    } ${form.payment_method === opt.v ? "border-gold bg-gold/5" : "border-gold/20"}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      disabled={opt.disabled}
                      checked={form.payment_method === opt.v}
                      onChange={() =>
                        set("payment_method", opt.v as "cod" | "bank_transfer" | "card" | "paypal")
                      }
                      className="mt-1 accent-gold"
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-white">{opt.label}</p>
                        {opt.v === "card" && (
                          <div className="flex gap-1">
                            {["VISA", "Mastercard", "AMEX"].map((brand) => (
                              <span
                                key={brand}
                                className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/50"
                              >
                                {brand}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-white/50">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-serif text-lg text-gold">{t("checkout.orderNotesSection")}</h2>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                className="mt-2 w-full border border-gold/20 bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-gold"
              />
            </section>
          </div>

          <aside className="order-1 h-fit border border-gold/20 bg-[#1A1A1A] p-6 md:order-none md:sticky md:top-24 md:self-start">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg text-white">{t("cart.orderSummary")}</h2>
              <Link to="/cart" className="flex items-center gap-1 text-xs text-gold/70 hover:text-gold">
                <Pencil size={11} />
                {t("checkout.editCart")}
              </Link>
            </div>

            <ul className="mt-4 space-y-3 border-b border-gold/10 pb-4">
              {items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex-1">
                    <span className="text-white/80">
                      {i.name}
                      {i.variantLabel && <span className="block text-gold-dark">{i.variantLabel}</span>}
                    </span>

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(i.id, i.quantity - 1)}
                        aria-label={t("cart.removeItem")}
                        className="flex h-5 w-5 items-center justify-center border border-gold/20 text-gold/70 hover:border-gold hover:text-gold"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="min-w-[1.5ch] text-center text-white/60">{i.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(i.id, i.quantity + 1)}
                        className="flex h-5 w-5 items-center justify-center border border-gold/20 text-gold/70 hover:border-gold hover:text-gold"
                      >
                        <Plus size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(i.id)}
                        aria-label={t("cart.removeItem")}
                        className="ml-1 flex h-5 w-5 items-center justify-center text-white/30 hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <span className="whitespace-nowrap font-mono text-gold">€{(i.price * i.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-white/70">
                <dt>{t("cart.subtotal")}</dt>
                <dd className="font-mono">€{total.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between text-white/70">
                <dt>{t("cart.shipping")}</dt>
                <dd className="font-mono">{shipping === 0 ? t("cart.free") : `€${shipping.toFixed(2)}`}</dd>
              </div>
              <div className="mt-3 flex justify-between border-t border-gold/10 pt-3 text-base text-white">
                <dt>{t("cart.total")}</dt>
                <dd className="font-mono text-gold">€{grandTotal.toFixed(2)}</dd>
              </div>
              {grandTotalEstimate.isConverted && (
                <div className="flex justify-end">
                  <span className="text-xs text-white/40">
                    {t("checkout.chargedInEurNote", { amount: grandTotalEstimate.formatted })}
                  </span>
                </div>
              )}
            </dl>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
            >
              {submitting ? t("checkout.placingOrder") : t("checkout.placeOrder")}
            </button>

            <p className="mt-3 text-center text-xs text-white/40">
              {t("checkout.agreeTerms")}
            </p>

            <div className="mt-5 flex items-center justify-center gap-4 border-t border-gold/10 pt-4 text-white/50">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Lock size={13} className="text-gold" />
                {t("checkout.secureCheckout")}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <ShieldCheck size={13} className="text-gold" />
                {t("checkout.buyerProtection")}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Truck size={13} className="text-gold" />
                {t("checkout.trackedDelivery")}
              </span>
            </div>
          </aside>
        </form>
      </section>
    </PageLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  className,
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border bg-[#1A1A1A] px-3 py-2 text-sm text-white outline-none focus:border-gold ${
          error ? "border-red-500" : "border-gold/20"
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </label>
  );
}