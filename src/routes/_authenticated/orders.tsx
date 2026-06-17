import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyOrders } from "@/lib/orders.functions";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "My Orders — KAPTAN" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const fetchOrders = useServerFn(getMyOrders);
  const { data, isLoading } = useQuery({ queryKey: ["my-orders"], queryFn: () => fetchOrders() });

  return (
    <PageLayout>
      <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">My Orders</h1>
        <div className="mt-6 flex flex-wrap gap-4 border-b border-gold/10 pb-4 text-sm">
          <Link to="/profile" className="text-white/60 hover:text-gold">Profile</Link>
          <Link to="/orders" className="text-gold">Orders</Link>
          <Link to="/wishlist" className="text-white/60 hover:text-gold">Wishlist</Link>
        </div>

        {isLoading ? (
          <p className="mt-10 text-white/60">Loading orders…</p>
        ) : !data?.orders.length ? (
          <div className="mt-12 flex flex-col items-center gap-4 border border-dashed border-gold/20 py-16 text-center">
            <p className="text-white/60">You have no orders yet.</p>
            <Link to="/products" className="border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-black">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {data.orders.map((o) => (
              <Link
                key={o.id}
                to="/orders/$id"
                params={{ id: o.id }}
                className="flex flex-wrap items-center justify-between gap-3 border border-gold/10 bg-[#1A1A1A] p-4 hover:border-gold/40"
              >
                <div>
                  <p className="font-mono text-sm text-gold">{o.order_number}</p>
                  <p className="text-xs text-white/50">{new Date(o.created_at!).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-wider ${badgeClass(o.status)}`}>
                    {o.status}
                  </span>
                  <span className="font-mono text-sm text-white">€{Number(o.total).toFixed(2)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
}

function badgeClass(s: string | null) {
  switch (s) {
    case "delivered": return "bg-green-500/20 text-green-300";
    case "shipped": return "bg-blue-500/20 text-blue-300";
    case "processing": return "bg-amber-500/20 text-amber-300";
    case "cancelled": return "bg-red-500/20 text-red-300";
    default: return "bg-gold/10 text-gold";
  }
}
