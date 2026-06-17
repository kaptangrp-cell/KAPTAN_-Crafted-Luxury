import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Package, ShoppingCart, Users, TrendingUp } from "lucide-react";
import { getAdminStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const fn = useServerFn(getAdminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });

  if (isLoading) return <p className="text-white/60">Loading...</p>;
  if (!data) return null;

  const stats = [
    { label: "Revenue", value: `€${data.revenue.toFixed(2)}`, icon: TrendingUp },
    { label: "Orders", value: data.orderCount, icon: ShoppingCart },
    { label: "Products", value: data.productCount, icon: Package },
    { label: "Customers", value: data.customerCount, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-white">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-gold/15 bg-[#1A1A1A] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-white/50">{s.label}</span>
              <s.icon size={18} className="text-gold/70" />
            </div>
            <p className="mt-3 font-mono text-2xl text-gold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="border border-gold/15 bg-[#1A1A1A]">
          <div className="border-b border-gold/10 p-4">
            <h2 className="font-serif text-lg text-white">Recent Orders</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/50">
              <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-gold/5">
                  <td className="p-3"><Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-gold">{o.order_number}</Link></td>
                  <td className="p-3 text-white/80">{o.customer_name}</td>
                  <td className="p-3 text-xs capitalize text-white/60">{o.status}</td>
                  <td className="p-3 text-right font-mono text-white">€{Number(o.total).toFixed(2)}</td>
                </tr>
              ))}
              {!data.recentOrders.length && (
                <tr><td colSpan={4} className="p-6 text-center text-white/50">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-gold/15 bg-[#1A1A1A] p-4">
          <h2 className="font-serif text-lg text-white">Status Breakdown</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {["pending", "processing", "shipped", "delivered", "cancelled"].map((s) => (
              <li key={s} className="flex justify-between text-white/70">
                <span className="capitalize">{s}</span>
                <span className="font-mono text-gold">{data.statusCounts[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
