import { Price } from "@/components/common/Price";
import { AccountHeader } from "@/components/account/AccountHeader";
import { useAuthStore } from "@/stores/authStore";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Package, Truck, CheckCircle, ArrowUpRight } from "lucide-react";
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
  const userId = useAuthStore((s) => s.user?.id);
  const fetchOrders = useServerFn(getMyOrders);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-orders", userId],
    queryFn: () => fetchOrders(),
    enabled: Boolean(userId),
  });

  return (
    <PageLayout>
      <section className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <AccountHeader active="orders" />

        {isLoading ? (
          <p className="mt-10 text-white/60">{t("orders.loadingOrders")}</p>
        ) : isError ? (
          <div role="alert" className="mt-10 text-white/70">
            <p>{t("orders.loadFailed")}</p>
            <button
              onClick={() => void refetch()}
              className="mt-3 border border-gold px-4 py-2 text-gold"
            >
              {t("orders.retry")}
            </button>
          </div>
        ) : !data?.orders.length ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold/15 bg-[#0D0D0D] px-5 py-16 text-center">
            <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
              <Package size={27} strokeWidth={1} />
            </span>
            <p className="font-serif text-xl text-white">{t("orders.empty")}</p>
            <Link
              to="/products"
              className="mt-2 rounded-full border border-gold/40 px-6 py-3 text-sm text-gold transition-colors hover:bg-gold hover:text-black"
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
                className="group block rounded-2xl border border-gold/15 bg-[#0D0D0D] p-5 transition-colors hover:border-gold/40 sm:p-7"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-serif text-xl text-white">{o.order_number}</p>
                    <p className="mt-2 text-xs text-white/50">
                      {new Date(o.created_at!).toLocaleDateString(
                        i18n.language === "de" ? "de-DE" : "en-GB",
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-wider ${badgeClass(o.status)}`}
                    >
                      {statusLabel(o.status, t)}
                    </span>
                    <span className="font-mono text-sm text-white">
                      <Price amount={Number(o.total)} />
                    </span>
                  </div>
                </div>

                <MiniTracker status={o.status} t={t} />
                <div className="mt-5 flex items-center justify-between border-t border-gold/10 pt-4 text-xs font-medium text-gold">
                  {t("accountStyle.viewOrder")}
                  <ArrowUpRight size={16} />
                </div>
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

  const activeIndex =
    status === "cancelled" ? -1 : steps.findIndex((s) => s.key === (status ?? "ordered"));

  if (status === "cancelled") {
    return <p className="mt-4 text-xs text-red-300">{t("orders.orderCancelled")}</p>;
  }

  return (
    <div className="mt-6 grid grid-cols-4 gap-2 rounded-xl bg-[#1A1A1A] p-3 sm:p-5">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = index <= activeIndex;

        return (
          <div
            key={step.key}
            className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                active ? "border-gold bg-gold text-black" : "border-white/20 text-white/40"
              }`}
            >
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
