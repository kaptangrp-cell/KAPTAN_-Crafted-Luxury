import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Package, ShoppingCart, Users, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getAdminStats, adminGetAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

const STATUS_BREAKDOWN = [
  { key: "ordered", label: "Ordered" },
  { key: "packaging", label: "Packaging" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const CHART_COLORS = ["#FFEB00", "#FFD700", "#BFA600", "#8A7800", "#5C5200"];

function AdminDashboard() {
  const statsFn = useServerFn(getAdminStats);
  const analyticsFn = useServerFn(adminGetAnalytics);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => statsFn(),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => analyticsFn(),
  });

  if (isLoading) return <p className="text-white/60">Loading...</p>;
  if (!data) return null;

  const stats = [
    { label: "Revenue", value: `€${data.revenue.toFixed(2)}`, icon: TrendingUp },
    { label: "Orders", value: data.orderCount, icon: ShoppingCart },
    { label: "Products", value: data.productCount, icon: Package },
    { label: "Customers", value: data.customerCount, icon: Users },
  ];

  const statusChartData = STATUS_BREAKDOWN.map((s) => ({
    name: s.label,
    value: data.statusCounts[s.key] ?? 0,
  })).filter((s) => s.value > 0);

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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="border border-gold/15 bg-[#1A1A1A]">
          <div className="border-b border-gold/10 p-4">
            <h2 className="font-serif text-lg text-white">Recent Orders</h2>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>

            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-gold/5">
                  <td className="p-3">
                    <Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-gold">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="p-3 text-white/80">{o.customer_name}</td>
                  <td className="p-3 text-xs text-white/60">{statusLabel(o.status)}</td>
                  <td className="p-3 text-right font-mono text-white">€{Number(o.total).toFixed(2)}</td>
                </tr>
              ))}

              {!data.recentOrders.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-white/50">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-gold/15 bg-[#1A1A1A] p-4">
          <h2 className="font-serif text-lg text-white">Status Breakdown</h2>

          <ul className="mt-4 space-y-2 text-sm">
            {STATUS_BREAKDOWN.map((s) => (
              <li key={s.key} className="flex justify-between text-white/70">
                <span>{s.label}</span>
                <span className="font-mono text-gold">{data.statusCounts[s.key] ?? 0}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 h-48">
            {statusChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="name" outerRadius={70}>
                    {statusChartData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-white/50">No status data yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border border-gold/15 bg-[#1A1A1A] p-4">
          <h2 className="font-serif text-lg text-white">Sales by Day</h2>

          <div className="mt-4 h-72">
            {analyticsLoading ? (
              <p className="text-white/50">Loading chart...</p>
            ) : analytics?.salesByDay?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.salesByDay}>
                  <XAxis dataKey="date" stroke="#D4D4D4" fontSize={11} />
                  <YAxis stroke="#D4D4D4" fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#FFEB00" strokeWidth={2} name="Revenue €" />
                  <Line type="monotone" dataKey="orders" stroke="#FFFFFF" strokeWidth={2} name="Orders" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/50">No sales data yet.</p>
            )}
          </div>
        </div>

        <div className="border border-gold/15 bg-[#1A1A1A] p-4">
          <h2 className="font-serif text-lg text-white">Best Selling Products</h2>

          <div className="mt-4 h-72">
            {analyticsLoading ? (
              <p className="text-white/50">Loading chart...</p>
            ) : analytics?.bestProducts?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.bestProducts}>
                  <XAxis dataKey="product_name" stroke="#D4D4D4" fontSize={10} />
                  <YAxis stroke="#D4D4D4" fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#FFEB00" name="Units Sold" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/50">No product sales yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string | null) {
  switch (status) {
    case "ordered":
      return "Ordered";
    case "packaging":
      return "Packaging";
    case "out_for_delivery":
      return "Out for Delivery";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "pending":
      return "Ordered";
    case "processing":
      return "Packaging";
    case "shipped":
      return "Out for Delivery";
    default:
      return "Ordered";
  }
}