import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Package, Truck, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getMyOrders } from "@/lib/orders.functions";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "My Orders — KAPTAN" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { t, i18n } = useTranslation();
  const fetchOrders = useServerFn(getMyOrders);

  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
  });

  return (
    <PageLayout>
      <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
        <h1 className="font-serif text-4xl font-semibold text-white">{t("orders.title")}</h1>

        <div className="mt-6 flex flex-wrap gap-4 border-b border-gold/10 pb-4 text-sm">
          <Link to="/profile" className="text-white/60 hover:text-gold">
            {t("account.navProfile")}
          </Link>
          <Link to="/orders" className="text-gold">
            {t("account.navOrders")}
          </Link>
          <Link to="/wishlist" className="text-white/60 hover:text-gold">
            {t("account.navWishlist")}
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-10 text-white/60">{t("orders.loadingOrders")}</p>
        ) : !data?.orders.length ? (
          <div className="mt-12 flex flex-col items-center gap-4 border border-dashed border-gold/20 py-16 text-center">
            <p className="text-white/60">{t("orders.empty")}</p>
            <Link
              to="/products"
              className="border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-black"
            >
              {t("orders.startShopping")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {data.orders.map((o) => (
              <Link
                key={o.id}
                to="/orders/$id"
                params={{ id: o.id }}
                className="block border border-gold/10 bg-[#1A1A1A] p-4 hover:border-gold/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-gold">{o.order_number}</p>
                    <p className="text-xs text-white/50">
                      {new Date(o.created_at!).toLocaleDateString(i18n.language === "de" ? "de-DE" : "en-GB")}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-wider ${badgeClass(o.status)}`}>
                      {statusLabel(o.status, t)}
                    </span>
                    <span className="font-mono text-sm text-white">
                      €{Number(o.total).toFixed(2)}
                    </span>
                  </div>
                </div>

                <MiniTracker status={o.status} t={t} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
}

function MiniTracker({ status, t }: { status: string | null; t: TFunction }) {
  const steps = [
    { key: "ordered", label: t("account.statusOrdered"), icon: PackageCheck },
    { key: "packaging", label: t("account.statusPackaging"), icon: Package },
    { key: "out_for_delivery", label: t("orders.trackerDeliveryShort"), icon: Truck },
    { key: "delivered", label: t("account.statusDelivered"), icon: CheckCircle },
  ];

  const activeIndex = status === "cancelled" ? -1 : steps.findIndex((s) => s.key === (status ?? "ordered"));

  if (status === "cancelled") {
    return <p className="mt-4 text-xs text-red-300">{t("orders.orderCancelled")}</p>;
  }

  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = index <= activeIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${
              active ? "border-gold bg-gold text-black" : "border-white/20 text-white/40"
            }`}>
              <Icon size={14} />
            </span>
            <span className={active ? "text-xs text-gold" : "text-xs text-white/40"}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(s: string | null, t: TFunction) {
  switch (s) {
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
    default:
      return t("account.statusOrdered");
  }
}

function badgeClass(s: string | null) {
  switch (s) {
    case "delivered":
      return "bg-green-500/20 text-green-300";
    case "out_for_delivery":
      return "bg-blue-500/20 text-blue-300";
    case "packaging":
      return "bg-amber-500/20 text-amber-300";
    case "cancelled":
      return "bg-red-500/20 text-red-300";
    default:
      return "bg-gold/10 text-gold";
  }
}