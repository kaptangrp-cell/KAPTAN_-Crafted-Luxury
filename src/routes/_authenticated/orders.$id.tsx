import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Package, Truck, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getOrderById } from "@/lib/orders.functions";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({ meta: [{ title: "Order Details — KAPTAN" }] }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = Route.useParams();
  const fetchOrder = useServerFn(getOrderById);

  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder({ data: { id } }),
  });

  if (isLoading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-3xl p-12 text-white/60">{t("orderDetail.loading")}</div>
      </PageLayout>
    );
  }

  const order = data?.order as never as {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    payment_method: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    shipping_address: {
      line1: string;
      line2?: string | null;
      city: string;
      state?: string | null;
      postal_code: string;
      country: string;
    };
    subtotal: number;
    shipping_cost: number;
    total: number;
    created_at: string;
    order_items: {
      id: string;
      product_name: string;
      variant_info: string | null;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[];
  } | null;

  if (!order) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-3xl p-12 text-center text-white/60">
          {t("orderDetail.notFound")}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="mx-auto max-w-4xl px-4 py-12 md:px-6">
        <Link to="/orders" className="text-xs text-gold/70 hover:text-gold">
          ← {t("orderDetail.backToOrders")}
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-white">
              {t("orderDetail.orderHeading", { orderNumber: order.order_number })}
            </h1>
            <p className="text-sm text-white/50">
              {t("orderDetail.placedPrefix")} {new Date(order.created_at).toLocaleString(i18n.language === "de" ? "de-DE" : "en-GB")}
            </p>
          </div>

          <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ${badgeClass(order.status)}`}>
            {statusLabel(order.status, t)}
          </span>
        </div>

        <DeliveryTracker status={order.status} t={t} />

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="border border-gold/10 bg-[#1A1A1A] p-4">
            <h3 className="text-xs uppercase tracking-wider text-gold/70">{t("orderDetail.contactTitle")}</h3>
            <p className="mt-2 text-sm text-white">{order.customer_name}</p>
            <p className="text-xs text-white/60">{order.customer_email}</p>
            <p className="text-xs text-white/60">{order.customer_phone}</p>
          </div>

          <div className="border border-gold/10 bg-[#1A1A1A] p-4">
            <h3 className="text-xs uppercase tracking-wider text-gold/70">{t("orderDetail.shippingTitle")}</h3>
            <p className="mt-2 text-sm text-white">{order.shipping_address.line1}</p>
            {order.shipping_address.line2 && (
              <p className="text-sm text-white">{order.shipping_address.line2}</p>
            )}
            <p className="text-xs text-white/60">
              {order.shipping_address.city}
              {order.shipping_address.state ? `, ${order.shipping_address.state}` : ""}{" "}
              {order.shipping_address.postal_code}
            </p>
            <p className="text-xs text-white/60">{order.shipping_address.country}</p>
          </div>

          <div className="border border-gold/10 bg-[#1A1A1A] p-4">
            <h3 className="text-xs uppercase tracking-wider text-gold/70">{t("orderDetail.paymentTitle")}</h3>
            <p className="mt-2 text-sm capitalize text-white">
              {order.payment_method.replace("_", " ")}
            </p>
            <p className="text-xs capitalize text-white/60">
              {t("orderDetail.paymentStatusPrefix")} {order.payment_status}
            </p>
          </div>
        </div>

        <div className="mt-8 border border-gold/10 bg-[#1A1A1A]">
          <table className="w-full text-sm">
            <thead className="border-b border-gold/10 text-left text-xs uppercase tracking-wider text-gold/70">
              <tr>
                <th className="p-3">{t("orderDetail.itemHeader")}</th>
                <th className="p-3 text-center">{t("orderDetail.qtyHeader")}</th>
                <th className="p-3 text-right">{t("orderDetail.priceHeader")}</th>
                <th className="p-3 text-right">{t("orderDetail.totalHeader")}</th>
              </tr>
            </thead>

            <tbody>
              {order.order_items.map((item) => (
                <tr key={item.id} className="border-b border-gold/5 last:border-0">
                  <td className="p-3 text-white">
                    {item.product_name}
                    {item.variant_info && (
                      <span className="block text-xs text-gold-dark">
                        {item.variant_info}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center text-white/70">{item.quantity}</td>
                  <td className="p-3 text-right font-mono text-white/70">
                    €{Number(item.unit_price).toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono text-gold">
                    €{Number(item.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
          <div className="flex justify-between text-white/70">
            <span>{t("cart.subtotal")}</span>
            <span className="font-mono">€{Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-white/70">
            <span>{t("cart.shipping")}</span>
            <span className="font-mono">€{Number(order.shipping_cost).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gold/10 pt-2 text-base text-white">
            <span>{t("cart.total")}</span>
            <span className="font-mono text-gold">€{Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}

function DeliveryTracker({ status, t }: { status: string | null; t: TFunction }) {
  const steps = [
    { key: "ordered", label: t("account.statusOrdered"), icon: PackageCheck },
    { key: "packaging", label: t("account.statusPackaging"), icon: Package },
    { key: "out_for_delivery", label: t("account.statusOutForDelivery"), icon: Truck },
    { key: "delivered", label: t("account.statusDelivered"), icon: CheckCircle },
  ];

  const activeIndex = status === "cancelled" ? -1 : steps.findIndex((s) => s.key === (status ?? "ordered"));

  if (status === "cancelled") {
    return (
      <div className="mt-8 border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
        {t("orderDetail.orderCancelledBanner")}
      </div>
    );
  }

  return (
    <div className="mt-8 border border-gold/10 bg-[#1A1A1A] p-5">
      <h2 className="font-serif text-xl text-white">{t("orderDetail.deliveryStatus")}</h2>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = index <= activeIndex;

          return (
            <div key={step.key} className="flex flex-col items-center text-center">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${
                active ? "border-gold bg-gold text-black" : "border-white/20 text-white/40"
              }`}>
                <Icon size={22} />
              </div>

              <p className={active ? "mt-2 text-sm font-semibold text-gold" : "mt-2 text-sm text-white/40"}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
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