import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOrderById } from "@/lib/orders.functions";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({ meta: [{ title: "Order Details — KAPTAN" }] }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { id } = Route.useParams();
  const fetchOrder = useServerFn(getOrderById);
  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder({ data: { id } }),
  });

  if (isLoading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-3xl p-12 text-white/60">Loading order…</div>
      </PageLayout>
    );
  }

  const order = data?.order as never as {
    id: string; order_number: string; status: string; payment_status: string; payment_method: string;
    customer_name: string; customer_email: string; customer_phone: string;
    shipping_address: { line1: string; line2?: string | null; city: string; state?: string | null; postal_code: string; country: string };
    subtotal: number; shipping_cost: number; total: number; created_at: string;
    order_items: { id: string; product_name: string; variant_info: string | null; quantity: number; unit_price: number; line_total: number }[];
  } | null;

  if (!order) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-3xl p-12 text-center text-white/60">Order not found.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-4xl px-4 py-12 md:px-6">
        <Link to="/orders" className="text-xs text-gold/70 hover:text-gold">← Back to orders</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-white">Order {order.order_number}</h1>
            <p className="text-sm text-white/50">Placed {new Date(order.created_at).toLocaleString()}</p>
          </div>
          <span className="rounded-full bg-gold/10 px-3 py-1 text-xs uppercase tracking-wider text-gold">
            {order.status}
          </span>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="border border-gold/10 bg-[#1A1A1A] p-4">
            <h3 className="text-xs uppercase tracking-wider text-gold/70">Contact</h3>
            <p className="mt-2 text-sm text-white">{order.customer_name}</p>
            <p className="text-xs text-white/60">{order.customer_email}</p>
            <p className="text-xs text-white/60">{order.customer_phone}</p>
          </div>
          <div className="border border-gold/10 bg-[#1A1A1A] p-4">
            <h3 className="text-xs uppercase tracking-wider text-gold/70">Shipping</h3>
            <p className="mt-2 text-sm text-white">{order.shipping_address.line1}</p>
            {order.shipping_address.line2 && <p className="text-sm text-white">{order.shipping_address.line2}</p>}
            <p className="text-xs text-white/60">
              {order.shipping_address.city}{order.shipping_address.state ? `, ${order.shipping_address.state}` : ""} {order.shipping_address.postal_code}
            </p>
            <p className="text-xs text-white/60">{order.shipping_address.country}</p>
          </div>
          <div className="border border-gold/10 bg-[#1A1A1A] p-4">
            <h3 className="text-xs uppercase tracking-wider text-gold/70">Payment</h3>
            <p className="mt-2 text-sm capitalize text-white">{order.payment_method.replace("_", " ")}</p>
            <p className="text-xs capitalize text-white/60">Status: {order.payment_status}</p>
          </div>
        </div>

        <div className="mt-8 border border-gold/10 bg-[#1A1A1A]">
          <table className="w-full text-sm">
            <thead className="border-b border-gold/10 text-left text-xs uppercase tracking-wider text-gold/70">
              <tr><th className="p-3">Item</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {order.order_items.map((item) => (
                <tr key={item.id} className="border-b border-gold/5 last:border-0">
                  <td className="p-3 text-white">
                    {item.product_name}
                    {item.variant_info && <span className="block text-xs text-gold-dark">{item.variant_info}</span>}
                  </td>
                  <td className="p-3 text-center text-white/70">{item.quantity}</td>
                  <td className="p-3 text-right font-mono text-white/70">€{Number(item.unit_price).toFixed(2)}</td>
                  <td className="p-3 text-right font-mono text-gold">€{Number(item.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
          <div className="flex justify-between text-white/70"><span>Subtotal</span><span className="font-mono">€{Number(order.subtotal).toFixed(2)}</span></div>
          <div className="flex justify-between text-white/70"><span>Shipping</span><span className="font-mono">€{Number(order.shipping_cost).toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-gold/10 pt-2 text-base text-white"><span>Total</span><span className="font-mono text-gold">€{Number(order.total).toFixed(2)}</span></div>
        </div>
      </section>
    </PageLayout>
  );
}
