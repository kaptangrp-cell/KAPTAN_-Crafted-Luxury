import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
  Boxes,
  Repeat,
  MousePointerClick,
  Wallet,
} from "lucide-react";
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
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getAdminStats, adminGetAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

const STATUS_BREAKDOWN = [
  { key: "ordered", labelKey: "account.statusOrdered" },
  { key: "packaging", labelKey: "account.statusPackaging" },
  { key: "out_for_delivery", labelKey: "account.statusOutForDelivery" },
  { key: "delivered", labelKey: "account.statusDelivered" },
  { key: "cancelled", labelKey: "account.statusCancelled" },
];

const PERIODS = [
  { value: "7d", labelKey: "admin.periodLast7" },
  { value: "30d", labelKey: "admin.periodLast30" },
  { value: "90d", labelKey: "admin.periodLast90" },
  { value: "this_month", labelKey: "admin.periodThisMonth" },
  { value: "last_month", labelKey: "admin.periodLastMonth" },
  { value: "all", labelKey: "admin.periodAllTime" },
];

const CHART_COLORS = ["#FFEB00", "#38BDF8", "#22C55E", "#F97316", "#EF4444"];

function AdminDashboard() {
  const { t } = useTranslation();
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

  if (isLoading) return <p className="text-white/60">{t("admin.loading")}</p>;
  if (!data) return null;

  const stats = [
    { label: t("admin.revenue"), value: `€${data.revenue.toFixed(2)}`, icon: TrendingUp },
    { label: t("admin.statOrders"), value: data.orderCount, icon: ShoppingCart },
    { label: t("admin.statProducts"), value: data.productCount, icon: Package },
    { label: t("admin.statCustomers"), value: data.customerCount, icon: Users },
  ];

  const todayStats = [
    { label: t("admin.todaysSales"), value: `€${data.todaysSales.toFixed(2)}`, icon: TrendingUp, alert: false },
    { label: t("admin.statOrders"), value: data.todaysOrderCount, icon: ShoppingCart, alert: false },
    { label: t("admin.statCustomers"), value: data.todaysNewCustomers, icon: Users, alert: false },
    { label: t("admin.productsSold"), value: data.todaysProductsSold, icon: Boxes, alert: false },
    { label: t("products.lowStock"), value: data.lowStockCount, icon: AlertTriangle, alert: data.lowStockCount > 0 },
    { label: t("admin.pendingOrders"), value: data.pendingOrdersCount, icon: Clock, alert: data.pendingOrdersCount > 0 },
  ];

  const statusChartData = STATUS_BREAKDOWN.map((s) => ({
    name: t(s.labelKey),
    value: data.statusCounts[s.key] ?? 0,
  })).filter((s) => s.value > 0);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-white">{t("admin.dashboardTitle")}</h1>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
          {t("admin.today")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {todayStats.map((s) => (
            <div
              key={s.label}
              className={`border p-4 ${
                s.alert ? "border-amber-500/40 bg-amber-500/5" : "border-gold/15 bg-[#1A1A1A]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-white/50">{s.label}</span>
                <s.icon size={16} className={s.alert ? "text-amber-400" : "text-gold/70"} />
              </div>
              <p className={`mt-3 font-mono text-2xl ${s.alert ? "text-amber-400" : "text-gold"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

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
        <h2 className="font-serif text-lg text-white">{t("admin.analyticsFiltersTitle")}</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Select label={t("admin.timePeriod")} value={period} onChange={setPeriod}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
            ))}
          </Select>

          <Select label={t("admin.orderStatus")} value={status} onChange={setStatus}>
            <option value="all">{t("admin.allStatuses")}</option>
            {STATUS_BREAKDOWN.map((s) => (
              <option key={s.key} value={s.key}>{t(s.labelKey)}</option>
            ))}
          </Select>

          <Select label={t("admin.product")} value={productName} onChange={setProductName}>
            <option value="all">{t("products.allProducts")}</option>
            {(analytics?.productNames ?? []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <MiniStat label={t("admin.filteredRevenue")} value={`€${Number(analytics?.totalRevenue ?? 0).toFixed(2)}`} icon={TrendingUp} />
          <MiniStat label={t("admin.filteredOrders")} value={String(analytics?.totalOrders ?? 0)} icon={ShoppingCart} />
          <MiniStat label={t("admin.averageOrderValue")} value={`€${Number(analytics?.averageOrderValue ?? 0).toFixed(2)}`} icon={Wallet} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <MiniStat
            label={t("admin.conversionRate")}
            value={
              analytics && analytics.totalVisits > 0
                ? `${(Number(analytics.conversionRate ?? 0) * 100).toFixed(2)}%`
                : t("admin.noVisitData")
            }
            hint={analytics && analytics.totalVisits > 0 ? t("admin.visitsTracked", { count: analytics.totalVisits }) : undefined}
            icon={MousePointerClick}
          />
          <MiniStat
            label={t("admin.returningCustomers")}
            value={
              analytics
                ? `${analytics.returningCustomers} (${(Number(analytics.returningCustomerRate ?? 0) * 100).toFixed(0)}%)`
                : "—"
            }
            hint={analytics ? t("admin.ofCustomers", { count: analytics.totalCustomers }) : undefined}
            icon={Repeat}
          />
          <MiniStat
            label={t("admin.profit")}
            value={analytics ? `€${Number(analytics.profit ?? 0).toFixed(2)}` : "—"}
            hint={
              analytics && analytics.itemsMissingCost > 0
                ? t("admin.missingCostPrice", { count: analytics.itemsMissingCost })
                : t("admin.basedOnCostPrice")
            }
            icon={Wallet}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="border border-gold/15 bg-[#1A1A1A]">
          <div className="border-b border-gold/10 p-4">
            <h2 className="font-serif text-lg text-white">{t("admin.recentOrders")}</h2>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="p-3">{t("admin.orderCol")}</th>
                <th className="p-3">{t("admin.customerCol")}</th>
                <th className="p-3">{t("admin.statusCol")}</th>
                <th className="p-3 text-right">{t("admin.totalCol")}</th>
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
                  <td className="p-3 text-xs text-white/60">{statusLabel(o.status, t)}</td>
                  <td className="p-3 text-right font-mono text-white">€{Number(o.total).toFixed(2)}</td>
                </tr>
              ))}

              {!data.recentOrders.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-white/50">
                    {t("admin.noOrdersYet")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-gold/15 bg-[#1A1A1A] p-4">
          <h2 className="font-serif text-lg text-white">{t("admin.statusBreakdown")}</h2>

          <ul className="mt-4 space-y-2 text-sm">
            {STATUS_BREAKDOWN.map((s) => (
              <li key={s.key} className="flex justify-between text-white/70">
                <span>{t(s.labelKey)}</span>
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
              <p className="text-center text-sm text-white/50">{t("admin.noStatusData")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartBox title={t("admin.salesByDay")}>
          {analyticsLoading ? (
            <p className="text-white/50">{t("admin.loadingChart")}</p>
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
                <Line type="monotone" dataKey="revenue" stroke="#FFEB00" strokeWidth={3} name={t("admin.revenueEurLegend")} />
                <Line type="monotone" dataKey="orders" stroke="#38BDF8" strokeWidth={2} name={t("admin.ordersLegend")} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/50">{t("admin.noSalesData")}</p>
          )}
        </ChartBox>

        <ChartBox title={t("admin.bestSellingProducts")}>
          {analyticsLoading ? (
            <p className="text-white/50">{t("admin.loadingChart")}</p>
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
                <Bar dataKey="quantity" fill="#FFEB00" name={t("admin.unitsSoldLegend")} />
                <Bar dataKey="revenue" fill="#38BDF8" name={t("admin.revenueEurLegend")} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/50">{t("admin.noProductSales")}</p>
          )}
        </ChartBox>
      </div>

      <ChartBox title={t("admin.revenueByDeliveryStatus")}>
        {analyticsLoading ? (
          <p className="text-white/50">{t("admin.loadingChart")}</p>
        ) : analytics?.revenueByStatus?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.revenueByStatus}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="status" stroke="#CFCFCF" fontSize={11} tickFormatter={(s: string) => statusLabel(s, t)} />
              <YAxis stroke="#CFCFCF" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0D0D0D",
                  border: "1px solid rgba(255,235,0,0.3)",
                  color: "#fff",
                }}
                labelFormatter={(s: string) => statusLabel(s, t)}
              />
              <Bar dataKey="revenue" fill="#22C55E" name={t("admin.revenueEurLegend")} />
              <Bar dataKey="orders" fill="#F97316" name={t("admin.ordersLegend")} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-white/50">{t("admin.noRevenueData")}</p>
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

function MiniStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="border border-gold/10 bg-[#0D0D0D] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
        {Icon && <Icon size={14} className="text-gold/60" />}
      </div>
      <p className="mt-1 font-mono text-xl text-gold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-white/40">{hint}</p>}
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

function statusLabel(status: string | null, t: TFunction) {
  switch (status) {
    case "ordered":
      return t("account.statusOrdered");
    case "packaging":
      return t("account.statusPackaging");
    case "out_for_delivery":
      return t("account.statusOutForDelivery");
    case "delivered":
      return t("account.statusDelivered");
    case "cancelled":
      return t("account.statusCancelled");
    case "pending":
      return t("account.statusOrdered");
    case "processing":
      return t("account.statusPackaging");
    case "shipped":
      return t("account.statusOutForDelivery");
    default:
      return t("account.statusOrdered");
  }
}