import { useState } from "react";
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
  CartesianGrid,
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

const PERIODS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "all", label: "All Time" },
];

const CHART_COLORS = ["#FFEB00", "#38BDF8", "#22C55E", "#F97316", "#EF4444"];

function AdminDashboard() {
  const statsFn = useServerFn(getAdminStats);
  const analyticsFn = useServerFn(adminGetAnalytics);

  const [period, setPeriod] = useState("30d");
  const [status, setStatus] = useState("all");
  const [productName, setProductName] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => statsFn(),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["admin-analytics", period, status, productName],
    queryFn: () =>
      analyticsFn({
        data: {
          period,
          status,
          productName,
        },
      }),
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

      <div className="border border-gold/15 bg-[#1A1A1A] p-4">
        <h2 className="font-serif text-lg text-white">Analytics Filters</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Select label="Time Period" value={period} onChange={setPeriod}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>

          <Select label="Order Status" value={status} onChange={setStatus}>
            <option value="all">All Statuses</option>
            {STATUS_BREAKDOWN.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </Select>

          <Select label="Product" value={productName} onChange={setProductName}>
            <option value="all">All Products</option>
            {(analytics?.productNames ?? []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <MiniStat label="Filtered Revenue" value={`€${Number(analytics?.totalRevenue ?? 0).toFixed(2)}`} />
          <MiniStat label="Filtered Orders" value={String(analytics?.totalOrders ?? 0)} />
          <MiniStat label="Average Order" value={`€${Number(analytics?.averageOrderValue ?? 0).toFixed(2)}`} />
        </div>
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
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0D0D0D",
                      border: "1px solid rgba(255,235,0,0.3)",
                      color: "#fff",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-white/50">No status data yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartBox title="Sales by Day">
          {analyticsLoading ? (
            <p className="text-white/50">Loading chart...</p>
          ) : analytics?.salesByDay?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.salesByDay}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" stroke="#CFCFCF" fontSize={11} />
                <YAxis stroke="#CFCFCF" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0D0D0D",
                    border: "1px solid rgba(255,235,0,0.3)",
                    color: "#fff",
                  }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#FFEB00" strokeWidth={3} name="Revenue €" />
                <Line type="monotone" dataKey="orders" stroke="#38BDF8" strokeWidth={2} name="Orders" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/50">No sales data for this filter.</p>
          )}
        </ChartBox>

        <ChartBox title="Best Selling Products">
          {analyticsLoading ? (
            <p className="text-white/50">Loading chart...</p>
          ) : analytics?.bestProducts?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.bestProducts}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="product_name" stroke="#CFCFCF" fontSize={10} />
                <YAxis stroke="#CFCFCF" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0D0D0D",
                    border: "1px solid rgba(255,235,0,0.3)",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="quantity" fill="#FFEB00" name="Units Sold" />
                <Bar dataKey="revenue" fill="#38BDF8" name="Revenue €" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/50">No product sales for this filter.</p>
          )}
        </ChartBox>
      </div>

      <ChartBox title="Revenue by Delivery Status">
        {analyticsLoading ? (
          <p className="text-white/50">Loading chart...</p>
        ) : analytics?.revenueByStatus?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.revenueByStatus}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="status" stroke="#CFCFCF" fontSize={11} tickFormatter={statusLabel} />
              <YAxis stroke="#CFCFCF" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0D0D0D",
                  border: "1px solid rgba(255,235,0,0.3)",
                  color: "#fff",
                }}
                labelFormatter={statusLabel}
              />
              <Bar dataKey="revenue" fill="#22C55E" name="Revenue €" />
              <Bar dataKey="orders" fill="#F97316" name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-white/50">No revenue data for this filter.</p>
        )}
      </ChartBox>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gold/20 bg-[#0D0D0D] px-3 py-2 text-sm text-white outline-none focus:border-gold"
      >
        {children}
      </select>
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gold/10 bg-[#0D0D0D] p-3">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 font-mono text-xl text-gold">{value}</p>
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gold/15 bg-[#1A1A1A] p-4">
      <h2 className="font-serif text-lg text-white">{title}</h2>
      <div className="mt-4 h-72">{children}</div>
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