import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Lock, Truck } from "lucide-react";
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
import { getStripeJs } from "@/lib/payments/stripe-client";

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
            label: shippingAmount === 0 ? "Free Shipping" : "Standard Shipping",
            detail: "3–6 business days",
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
            toast.error(confirmResult.error.message ?? "Payment failed");
            return;
          }

          ev.complete("success");

          if (confirmResult.paymentIntent?.status === "requires_action") {
            const actionResult = await stripe.confirmCardPayment(clientSecret);
            if (actionResult.error) {
              toast.error(actionResult.error.message ?? "Payment could not be completed");
              return;
            }
          }

          await confirmPaymentFn({ data: { orderId, paymentIntentId } });
          onOrderPlaced(orderId);
        } catch (err) {
          ev.complete("fail");
          toast.error(err instanceof Error ? err.message : "Payment failed");
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
        <span className="text-[11px] uppercase tracking-wider">Or pay manually</span>
        <span className="h-px flex-1 bg-gold/10" />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — KAPTAN" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCartStore();
  const { user, profile } = useAuthStore();
  const createOrderFn = useServerFn(createOrder);
  const createStripeSessionFn = useServerFn(createStripeCheckoutSession);
  const createPaypalOrderFn = useServerFn(createPaypalCheckoutOrder);
  const [submitting, setSubmitting] = useState(false);

  const total = subtotal();
  const shipping = total > 50 ? 0 : 5.99;
  const grandTotal = total + shipping;

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
    payment_method: "cod" as "cod" | "bank_transfer" | "card" | "paypal",
    notes: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (items.length === 0) {
      toast.error("Your cart is empty");
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
      toast.success(`Order ${orderNumber} placed!`);
      navigate({ to: "/orders/$id", params: { id: orderId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <PageLayout>
        <section className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-serif text-3xl text-white">Your cart is empty</h1>
          <Link
            to="/products"
            className="mt-6 inline-block border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-black"
          >
            Continue Shopping
          </Link>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">Checkout</h1>

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
              toast.success("Order placed!");
              navigate({ to: "/orders/$id", params: { id: orderId } });
            }}
          />
        </div>

        <form onSubmit={handleSubmit} className="grid gap-8 md:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <section>
              <h2 className="font-serif text-lg text-gold">Contact</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Full Name" value={form.customer_name} onChange={(v) => set("customer_name", v)} required />
                <Field label="Email" type="email" value={form.customer_email} onChange={(v) => set("customer_email", v)} required />
                <Field label="Phone" value={form.customer_phone} onChange={(v) => set("customer_phone", v)} required />
              </div>
            </section>

            <section>
              <h2 className="font-serif text-lg text-gold">Shipping Address</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field className="md:col-span-2" label="Address Line 1" value={form.line1} onChange={(v) => set("line1", v)} required />
                <Field className="md:col-span-2" label="Address Line 2" value={form.line2} onChange={(v) => set("line2", v)} />
                <Field label="City" value={form.city} onChange={(v) => set("city", v)} required />
                <Field label="State / Region" value={form.state} onChange={(v) => set("state", v)} />
                <Field label="Postal Code" value={form.postal_code} onChange={(v) => set("postal_code", v)} required />
                <Field label="Country" value={form.country} onChange={(v) => set("country", v)} required />
              </div>
            </section>

            <section>
              <h2 className="font-serif text-lg text-gold">Payment Method</h2>
              <div className="mt-3 space-y-2">
                {[
                  {
                    v: "card",
                    label: "Card (Visa, Mastercard, Amex)",
                    desc: STRIPE_ENABLED
                      ? "Secure checkout powered by Stripe."
                      : "Coming soon — secure checkout powered by Stripe.",
                    disabled: !STRIPE_ENABLED,
                  },
                  {
                    v: "paypal",
                    label: "PayPal",
                    desc: PAYPAL_ENABLED
                      ? "Pay with your PayPal balance, card, or bank account."
                      : "Coming soon — pay with your PayPal account.",
                    disabled: !PAYPAL_ENABLED,
                  },
                  { v: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives.", disabled: false },
                  {
                    v: "bank_transfer",
                    label: "Bank Transfer",
                    desc: "Manual transfer; we'll email instructions.",
                    disabled: false,
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
                    <div>
                      <p className="text-sm text-white">{opt.label}</p>
                      <p className="text-xs text-white/50">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-serif text-lg text-gold">Order Notes (optional)</h2>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                className="mt-2 w-full border border-gold/20 bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-gold"
              />
            </section>
          </div>

          <aside className="h-fit border border-gold/20 bg-[#1A1A1A] p-6">
            <h2 className="font-serif text-lg text-white">Order Summary</h2>
            <ul className="mt-4 space-y-3 border-b border-gold/10 pb-4">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 text-xs">
                  <span className="text-white/80">
                    {i.name} × {i.quantity}
                    {i.variantLabel && <span className="block text-gold-dark">{i.variantLabel}</span>}
                  </span>
                  <span className="font-mono text-gold">€{(i.price * i.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-white/70">
                <dt>Subtotal</dt>
                <dd className="font-mono">€{total.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between text-white/70">
                <dt>Shipping</dt>
                <dd className="font-mono">{shipping === 0 ? "Free" : `€${shipping.toFixed(2)}`}</dd>
              </div>
              <div className="mt-3 flex justify-between border-t border-gold/10 pt-3 text-base text-white">
                <dt>Total</dt>
                <dd className="font-mono text-gold">€{grandTotal.toFixed(2)}</dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
            >
              {submitting ? "Placing order..." : "Place Order"}
            </button>

            <p className="mt-3 text-center text-xs text-white/40">
              By placing this order you agree to our terms.
            </p>

            <div className="mt-5 flex items-center justify-center gap-4 border-t border-gold/10 pt-4 text-white/50">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Lock size={13} className="text-gold" />
                Secure Checkout
              </span>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <ShieldCheck size={13} className="text-gold" />
                Buyer Protection
              </span>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Truck size={13} className="text-gold" />
                Tracked Delivery
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gold/20 bg-[#1A1A1A] px-3 py-2 text-sm text-white outline-none focus:border-gold"
      />
    </label>
  );
}