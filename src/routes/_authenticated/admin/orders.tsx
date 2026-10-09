import { formatEuro } from "@/lib/currency";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AdminFeedback } from "@/components/admin/AdminFeedback";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { adminListOrders, adminUpdateOrderStatus, adminExportOrders } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  validateSearch: z.object({ orderNumber: z.string().optional() }).parse,
  component: AdminOrdersPage,
});

const STATUSES = [
  { value: "ordered", labelKey: "account.statusOrdered" },
  { value: "packaging", labelKey: "account.statusPackaging" },
  { value: "out_for_delivery", labelKey: "account.statusOutForDelivery" },
  { value: "delivered", labelKey: "account.statusDelivered" },
  { value: "cancelled", labelKey: "account.statusCancelled" },
] as const;

function AdminOrdersPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const search = Route.useSearch();
  const [orderNumber, setOrderNumber] = useState(search.orderNumber ?? "");
  useEffect(() => setOrderNumber(search.orderNumber ?? ""), [search.orderNumber]);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listFn = useServerFn(adminListOrders);
  const updateFn = useServerFn(adminUpdateOrderStatus);
  const exportFn = useServerFn(adminExportOrders);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-orders", userId, orderNumber],
    queryFn: () => listFn({ data: { orderNumber: orderNumber || undefined } }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateFn({ data: { id, status } }),
    onSuccess: () => {
      toast.success(t("adminOrders.statusUpdatedToast"));
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function getExportRows() {
    const result = await exportFn();

    return (result.orders ?? []).map((o) => {
      const address =
        typeof o.shipping_address === "object" &&
        o.shipping_address !== null &&
        !Array.isArray(o.shipping_address)
          ? o.shipping_address
          : {};
      const items = (o.order_items ?? [])
        .map((item) => `${item.product_name} x ${item.quantity}`)
        .join(", ");

      return {
        order_number: o.order_number,
        customer_name: o.customer_name,
        customer_email: o.customer_email,
        customer_phone: o.customer_phone,
        status: statusLabel(o.status, t),
        payment_status: o.payment_status,
        payment_method: o.payment_method,
        subtotal: Number(o.subtotal ?? 0),
        shipping_cost: Number(o.shipping_cost ?? 0),
        total: Number(o.total ?? 0),
        address_line_1: address.line1 ?? "",
        address_line_2: address.line2 ?? "",
        city: address.city ?? "",
        state: address.state ?? "",
        postal_code: address.postal_code ?? "",
        country: address.country ?? "",
        items,
        created_at: o.created_at ? new Date(o.created_at).toLocaleString() : "",
      };
    });
  }

  async function exportExcel() {
    try {
      const rows = await getExportRows();

      if (!rows.length) {
        toast.error(t("adminOrders.noOrdersToExportToast"));
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `kaptan-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);

      toast.success(t("adminOrders.excelExportedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminOrders.exportFailedToast"));
    }
  }

  async function exportCSV() {
    try {
      const rows = await getExportRows();

      if (!rows.length) {
        toast.error(t("adminOrders.noOrdersToExportToast"));
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `kaptan-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();

      URL.revokeObjectURL(url);
      toast.success(t("adminOrders.csvExportedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminOrders.exportFailedToast"));
    }
  }

  const selected = data?.orders.find((order) => order.id === selectedId);
  const visibleOrders = (data?.orders ?? []).filter(
    (order) => filter === "all" || order.status === filter,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="font-serif text-3xl text-white">{t("adminOrders.title")}</h1>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid"
          >
            <Download size={16} />
            {t("adminOrders.exportExcel")}
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-gold px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-black"
          >
            <Download size={16} />
            {t("adminOrders.exportCsv")}
          </button>
        </div>
      </div>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("orderNumber");
          setOrderNumber(String(value ?? "").trim());
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-white">
          {t("adminOrders.findOrder")}
          <input
            name="orderNumber"
            defaultValue={orderNumber}
            key={search.orderNumber ?? "all"}
            placeholder="KPT-..."
            className="border border-gold/30 bg-black p-2 text-white"
          />
        </label>
        <button className="self-end border border-gold px-4 py-2 text-gold" type="submit">
          {t("adminOrders.search")}
        </button>
        <label className="flex flex-col gap-1 text-sm text-white">
          {t("admin.orderStatus")}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gold/30 bg-black p-2"
          >
            <option value="all">{t("admin.allStatuses")}</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {t(status.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </form>
      <p className="text-sm text-white/60">{t("adminOrders.listScope")}</p>
      {isError && <AdminFeedback retry={() => void refetch()} />}
      <div className="overflow-x-auto border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">{t("adminOrders.colOrderNumber")}</th>
              <th className="p-3">{t("adminOrders.colCustomer")}</th>
              <th className="p-3">{t("adminOrders.colDate")}</th>
              <th className="p-3">{t("adminOrders.colTotal")}</th>
              <th className="p-3">{t("adminOrders.colPayment")}</th>
              <th className="p-3">{t("adminOrders.colDeliveryStatus")}</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  {t("adminProducts.loading")}
                </td>
              </tr>
            )}

            {visibleOrders.map((o) => (
              <tr key={o.id} className="border-t border-gold/5">
                <td className="p-3">
                  <button
                    onClick={() => setSelectedId(o.id)}
                    className="font-mono text-gold hover:underline"
                  >
                    {o.order_number}
                  </button>
                </td>

                <td className="p-3 text-white">
                  <p>{o.customer_name}</p>
                  <p className="text-xs text-white/50">{o.customer_email}</p>
                </td>

                <td className="p-3 text-white/60">
                  {new Date(o.created_at!).toLocaleDateString(
                    i18n.language === "de" ? "de-DE" : "en-GB",
                  )}
                </td>

                <td className="p-3 font-mono text-white">
                  {formatEuro(Number(o.total), i18n.language)}
                </td>

                <td className="p-3 text-xs capitalize text-white/70">
                  {t(`paymentStatus.${o.payment_status}`, {
                    defaultValue: t("paymentStatus.unknown"),
                  })}
                </td>

                <td className="p-3">
                  <select
                    aria-label={t("adminWorkspace.orderStatusFor", { number: o.order_number })}
                    disabled={updateStatus.isPending}
                    value={o.status ?? "ordered"}
                    onChange={(e) =>
                      updateStatus.mutate({
                        id: o.id,
                        status: e.target.value,
                      })
                    }
                    className="border border-gold/20 bg-[#0D0D0D] px-2 py-1 text-xs text-white"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {t(s.labelKey)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}

            {!isLoading && !isError && !visibleOrders.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  {t("adminWorkspace.noMatches")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/20 bg-[#0D0D0D] text-white sm:max-w-2xl">
          <DialogTitle className="font-serif text-2xl text-gold">
            {selected?.order_number}
          </DialogTitle>
          <DialogDescription>{t("adminWorkspace.orderDetails")}</DialogDescription>
          {selected && (
            <div className="space-y-5">
              <div>
                <p className="font-medium">{selected.customer_name}</p>
                <p className="text-sm text-white/60">{selected.customer_email}</p>
              </div>
              <div className="rounded-xl border border-gold/15 p-4">
                <h3 className="mb-2 text-sm text-gold">{t("orderDetail.shippingTitle")}</h3>
                <p className="whitespace-pre-line text-sm text-white/70">
                  {selected.shipping_address &&
                  typeof selected.shipping_address === "object" &&
                  !Array.isArray(selected.shipping_address)
                    ? ["full_name", "line1", "line2", "postal_code", "city", "state", "country"]
                        .map((key) => (selected.shipping_address as Record<string, unknown>)[key])
                        .filter((value) => typeof value === "string")
                        .join("\n")
                    : "—"}
                </p>
              </div>
              <ul className="space-y-3">
                {selected.order_items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 text-sm">
                    <span>
                      {item.product_name} × {item.quantity}
                    </span>
                    <span className="text-gold">
                      {formatEuro(Number(item.line_total), i18n.language)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-gold/15 pt-4 text-right font-semibold text-gold">
                {t("cart.total")}: {formatEuro(Number(selected.total), i18n.language)}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
