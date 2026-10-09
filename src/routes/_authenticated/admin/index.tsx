import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
  ShoppingBag,
  Wallet,
  Users,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useTranslation } from "react-i18next";
import { getAdminStats, adminGetAnalytics } from "@/lib/admin.functions";
import { useAuthStore } from "@/stores/authStore";
import { formatEuro } from "@/lib/currency";
import { AdminFeedback } from "@/components/admin/AdminFeedback";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDashboard });
const statuses = ["ordered", "packaging", "out_for_delivery", "delivered", "cancelled"];
const statusKeys: Record<string, string> = {
  ordered: "statusOrdered",
  pending: "statusOrdered",
  processing: "statusPackaging",
  shipped: "statusOutForDelivery",
  packaging: "statusPackaging",
  out_for_delivery: "statusOutForDelivery",
  delivered: "statusDelivered",
  cancelled: "statusCancelled",
};
const periods = [
  { value: "7d", key: "periodLast7" },
  { value: "30d", key: "periodLast30" },
  { value: "90d", key: "periodLast90" },
  { value: "this_month", key: "periodThisMonth" },
  { value: "last_month", key: "periodLastMonth" },
  { value: "all", key: "periodAllTime" },
];

function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const statsFn = useServerFn(getAdminStats),
    analyticsFn = useServerFn(adminGetAnalytics);
  const [period, setPeriod] = useState("30d"),
    [status, setStatus] = useState("all"),
    [productName, setProductName] = useState("all");
  const stats = useQuery({ queryKey: ["admin-stats", userId], queryFn: () => statsFn() });
  const analytics = useQuery({
    queryKey: ["admin-analytics", userId, period, status, productName],
    queryFn: () => analyticsFn({ data: { period, status, productName } }),
  });
  const data = stats.data,
    report = analytics.data;
  const money = (value: number) => formatEuro(value, i18n.language);
  const refresh = () => {
    void stats.refetch();
    void analytics.refetch();
  };
  const statusName = (value: string) => t(`account.${statusKeys[value] ?? "statusOrdered"}`);
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">
            {t("adminWorkspace.overview")}
          </p>
          <h1 className="font-serif text-3xl text-white md:text-4xl">
            {t("adminWorkspace.title")}
          </h1>
          <p className="mt-2 text-sm text-white/60">{t("adminWorkspace.subtitle")}</p>
        </div>
        <button
          onClick={refresh}
          disabled={stats.isFetching || analytics.isFetching}
          className="flex items-center gap-2 border border-gold/25 px-4 py-2.5 text-sm text-gold disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={stats.isFetching || analytics.isFetching ? "motion-safe:animate-spin" : ""}
          />
          {t("adminWorkspace.refresh")}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            to: "/admin/orders",
            icon: Clock,
            label: t("adminWorkspace.fulfil"),
            value: data?.pendingOrdersCount,
          },
          {
            to: "/admin/products",
            icon: AlertTriangle,
            label: t("adminWorkspace.restock"),
            value: data?.lowStockCount,
          },
          {
            to: "/admin/customers",
            icon: Users,
            label: t("admin.statCustomers"),
            value: data?.customerCount,
          },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to as "/admin"}
            className="flex items-center gap-3 rounded-xl border border-gold/15 bg-[#0D0D0D] p-4 transition-colors hover:border-gold/50"
          >
            <item.icon size={20} className="text-gold" />
            <div className="flex-1">
              <p className="text-xs text-white/60">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-white">
                {item.value ?? "—"}
              </p>
            </div>
            <ArrowUpRight size={16} className="text-gold/60" />
          </Link>
        ))}
      </div>
      {stats.isError && <AdminFeedback retry={() => void stats.refetch()} />}
      <section className="rounded-2xl border border-gold/15 bg-[#0D0D0D] p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-white">{t("adminWorkspace.performance")}</h2>
            <p className="mt-1 text-xs text-white/60">{t("adminWorkspace.paidBasis")}</p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
            <Filter label={t("admin.timePeriod")} value={period} onChange={setPeriod}>
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(`admin.${p.key}`)}
                </option>
              ))}
            </Filter>
            <Filter label={t("admin.orderStatus")} value={status} onChange={setStatus}>
              <option value="all">{t("admin.allStatuses")}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusName(s)}
                </option>
              ))}
            </Filter>
            <Filter label={t("admin.product")} value={productName} onChange={setProductName}>
              <option value="all">{t("products.allProducts")}</option>
              {[
                ...new Set([
                  ...(report?.productNames ?? []),
                  ...(productName === "all" ? [] : [productName]),
                ]),
              ].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Filter>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-white/50">
          {t("adminWorkspace.filterBasis")}
        </p>
        {analytics.isError ? (
          <div className="mt-5">
            <AdminFeedback retry={() => void analytics.refetch()} />
          </div>
        ) : (
          <>
            <div
              className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              aria-busy={analytics.isFetching}
            >
              {[
                {
                  label: t("admin.revenue"),
                  value: report ? money(report.totalRevenue) : "—",
                  icon: TrendingUp,
                },
                {
                  label: t("admin.filteredOrders"),
                  value: report?.totalOrders ?? "—",
                  icon: ShoppingBag,
                },
                {
                  label: t("admin.averageOrderValue"),
                  value: report ? money(report.averageOrderValue) : "—",
                  icon: Wallet,
                },
                {
                  label: t("adminWorkspace.repeatBuyers"),
                  value: report ? `${report.returningCustomers} / ${report.totalCustomers}` : "—",
                  icon: Users,
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-gold/10 bg-[#1A1A1A] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-white/60">{metric.label}</p>
                    <metric.icon size={17} className="text-gold/70" />
                  </div>
                  <p className="mt-4 break-words text-2xl font-semibold tabular-nums text-gold">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
            {analytics.isPending ? (
              <p role="status" className="py-16 text-center text-white/60">
                {t("admin.loadingChart")}
              </p>
            ) : (
              <div className="mt-7">
                <h3 className="mb-5 text-sm font-medium text-white">
                  {t("admin.salesByDay")} · EUR
                </h3>
                <div className="h-64" role="img" aria-label={t("admin.salesByDay")}>
                  {report?.salesByDay.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={report.salesByDay}
                        margin={{ top: 10, right: 12, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient id="admin-revenue-gold" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#c5a43e" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#c5a43e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#88888825" />
                        <XAxis
                          dataKey="date"
                          stroke="#999"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis stroke="#999" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            background: "#161616",
                            border: "1px solid #c5a43e55",
                            borderRadius: 12,
                            color: "#fff",
                          }}
                          formatter={(value: number) => [money(value), t("admin.revenue")]}
                        />
                        <Area
                          type="linear"
                          dataKey="revenue"
                          stroke="#c5a43e"
                          strokeWidth={2}
                          fill="url(#admin-revenue-gold)"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-16 text-center text-sm text-white/50">
                      {t("admin.noSalesData")}
                    </p>
                  )}
                </div>
                {Boolean(report?.salesByDay.length) && (
                  <details className="mt-3 text-xs text-white/60">
                    <summary className="cursor-pointer text-gold">
                      {t("adminWorkspace.viewData")}
                    </summary>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr>
                            <th>{t("adminOrders.colDate")}</th>
                            <th>{t("admin.revenue")}</th>
                            <th>{t("admin.statOrders")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report?.salesByDay.map((day) => (
                            <tr key={day.date}>
                              <td>{day.date}</td>
                              <td>{money(day.revenue)}</td>
                              <td>{day.orders}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={t("admin.bestSellingProducts")}>
          {analytics.isError ? (
            <p className="text-sm text-white/60">{t("adminWorkspace.loadError")}</p>
          ) : !report ? (
            <p className="text-sm text-white/60">{t("admin.loading")}</p>
          ) : report.bestProducts.length ? (
            <ol className="space-y-4">
              {report.bestProducts.map((product, index) => (
                <li key={product.product_name} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-xs text-gold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{product.product_name}</p>
                    <p className="mt-1 text-xs text-white/50">
                      {product.quantity} {t("admin.unitsSoldLegend")}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-gold">{money(product.revenue)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-white/50">{t("admin.noProductSales")}</p>
          )}
        </Panel>
        <Panel title={t("adminWorkspace.insights")}>
          {analytics.isError || !report ? (
            <p className="text-sm text-white/60">
              {t(analytics.isError ? "adminWorkspace.loadError" : "admin.loading")}
            </p>
          ) : (
            <dl className="space-y-5 text-sm">
              <div>
                <dt className="text-white/60">{t("adminWorkspace.orderVisitRatio")}</dt>
                <dd className="mt-1 text-xl tabular-nums text-gold">
                  {report?.totalVisits
                    ? `${((report.conversionRate ?? 0) * 100).toFixed(1)}%`
                    : "—"}
                </dd>
                <p className="mt-1 text-xs text-white/50">
                  {t("adminWorkspace.visitCaveat", { count: report?.totalVisits ?? 0 })}
                </p>
              </div>
              <div>
                <dt className="text-white/60">{t("adminWorkspace.margin")}</dt>
                <dd className="mt-1 text-xl tabular-nums text-gold">
                  {report ? money(report.profit) : "—"}
                </dd>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  {t("adminWorkspace.marginCaveat")}
                </p>
                {Boolean(report?.itemsMissingCost) && (
                  <p className="mt-2 text-xs text-amber-400">
                    {t("admin.missingCostPrice", { count: report?.itemsMissingCost })}
                  </p>
                )}
              </div>
            </dl>
          )}
        </Panel>
      </div>
      <Panel
        title={t("admin.recentOrders")}
        action={
          <Link to="/admin/orders" className="flex items-center gap-1 text-xs text-gold">
            {t("adminWorkspace.manageOrders")}
            <ArrowUpRight size={14} />
          </Link>
        }
      >
        <p className="mb-3 text-xs text-white/50">{t("adminWorkspace.recentScope")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th>{t("admin.orderCol")}</th>
                <th>{t("admin.customerCol")}</th>
                <th>{t("admin.statusCol")}</th>
                <th className="text-right">{t("admin.totalCol")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentOrders.map((order) => (
                <tr key={order.id} className="border-t border-gold/10">
                  <td>
                    <Link
                      to="/admin/orders"
                      search={{ orderNumber: order.order_number }}
                      className="font-mono text-gold hover:underline"
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="text-white/80">{order.customer_name}</td>
                  <td>
                    <span className="rounded-full border border-gold/20 px-2.5 py-1 text-xs text-gold">
                      {statusName(order.status ?? "ordered")}
                    </span>
                  </td>
                  <td className="text-right tabular-nums text-white">
                    {money(Number(order.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.isPending && <p className="py-6 text-sm text-white/50">{t("admin.loading")}</p>}
        {data && !data.recentOrders.length && (
          <p className="py-6 text-sm text-white/50">{t("admin.noOrdersYet")}</p>
        )}
      </Panel>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel
          title={t("adminWorkspace.restock")}
          action={
            <Link to="/admin/products" className="text-xs text-gold">
              {t("admin.navProducts")} →
            </Link>
          }
        >
          {data?.lowStockProducts.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-4 border-b border-gold/10 py-3 text-sm"
            >
              <span className="text-white/80">{product.name}</span>
              <span className="text-gold">{product.stock_quantity}</span>
            </div>
          ))}
          {data && !data.lowStockProducts.length && (
            <p className="text-sm text-white/60">{t("adminWorkspace.stockHealthy")}</p>
          )}
        </Panel>
        <Panel title={t("admin.today") + " · UTC"}>
          <div className="grid grid-cols-2 gap-5">
            {[
              { label: t("admin.todaysSales"), value: data ? money(data.todaysSales) : "—" },
              { label: t("admin.statOrders"), value: data?.todaysOrderCount ?? "—" },
              { label: t("admin.productsSold"), value: data?.todaysProductsSold ?? "—" },
              { label: t("admin.statProducts"), value: data?.productCount ?? "—" },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-white/50">{item.label}</p>
                <p className="mt-2 text-xl tabular-nums text-gold">{item.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/50">{t("adminWorkspace.todayScope")}</p>
        </Panel>
      </div>
    </div>
  );
}
function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-white/50">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full max-w-64 border border-gold/20 bg-[#1A1A1A] px-3 py-2 text-sm text-white"
      >
        {children}
      </select>
    </label>
  );
}
function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-gold/15 bg-[#0D0D0D] p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
