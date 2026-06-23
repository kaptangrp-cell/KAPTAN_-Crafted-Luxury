import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { PageLayout } from "@/components/layout/PageLayout";
import { createOrder } from "@/lib/orders.functions";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — KAPTAN" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCartStore();
  const { user, profile } = useAuthStore();
  const createOrderFn = useServerFn(createOrder);
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
    payment_method: "cod" as "cod" | "bank_transfer",
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

        <form onSubmit={handleSubmit} className="mt-8 grid gap-8 md:grid-cols-[1fr_360px]">
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
                  { v: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives." },
                  { v: "bank_transfer", label: "Bank Transfer", desc: "Manual transfer; we'll email instructions." },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex cursor-pointer items-start gap-3 border p-3 ${
                      form.payment_method === opt.v ? "border-gold bg-gold/5" : "border-gold/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={form.payment_method === opt.v}
                      onChange={() => set("payment_method", opt.v as "cod" | "bank_transfer")}
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