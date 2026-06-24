import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import {
  adminListOrders,
  adminUpdateOrderStatus,
  adminExportOrders,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: AdminOrdersPage,
});

const STATUSES = [
  { value: "ordered", label: "Ordered" },
  { value: "packaging", label: "Packaging" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;

function AdminOrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListOrders);
  const updateFn = useServerFn(adminUpdateOrderStatus);
  const exportFn = useServerFn(adminExportOrders);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => listFn(),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateFn({ data: { id, status } }),
    onSuccess: () => {
      toast.success("Delivery status updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function getExportRows() {
    const result = await exportFn();

    return (result.orders ?? []).map((o: any) => {
      const address = o.shipping_address ?? {};
      const items = (o.order_items ?? [])
        .map((item: any) => `${item.product_name} x ${item.quantity}`)
        .join(", ");

      return {
        order_number: o.order_number,
        customer_name: o.customer_name,
        customer_email: o.customer_email,
        customer_phone: o.customer_phone,
        status: statusLabel(o.status),
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
        toast.error("No orders to export");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `kaptan-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);

      toast.success("Excel exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function exportCSV() {
    try {
      const rows = await getExportRows();

      if (!rows.length) {
        toast.error("No orders to export");
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
      toast.success("CSV exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="font-serif text-3xl text-white">Orders</h1>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-bold text-black hover:bg-gold-vivid"
          >
            <Download size={16} />
            Export Excel
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-gold px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-black"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">Order #</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Date</th>
              <th className="p-3">Total</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Delivery Status</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  Loading...
                </td>
              </tr>
            )}

            {(data?.orders ?? []).map((o) => (
              <tr key={o.id} className="border-t border-gold/5">
                <td className="p-3">
                  <Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-gold hover:underline">
                    {o.order_number}
                  </Link>
                </td>

                <td className="p-3 text-white">
                  <p>{o.customer_name}</p>
                  <p className="text-xs text-white/50">{o.customer_email}</p>
                </td>

                <td className="p-3 text-white/60">
                  {new Date(o.created_at!).toLocaleDateString()}
                </td>

                <td className="p-3 font-mono text-white">
                  €{Number(o.total).toFixed(2)}
                </td>

                <td className="p-3 text-xs capitalize text-white/70">
                  {o.payment_status}
                </td>

                <td className="p-3">
                  <select
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
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}

            {!isLoading && !data?.orders.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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