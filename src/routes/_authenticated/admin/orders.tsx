import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminListOrders, adminUpdateOrderStatus } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: AdminOrdersPage,
});

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

function AdminOrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListOrders);
  const updateFn = useServerFn(adminUpdateOrderStatus);
  const { data, isLoading } = useQuery({ queryKey: ["admin-orders"], queryFn: () => listFn() });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateFn({ data: { id, status } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["admin-orders"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-white">Orders</h1>

      <div className="overflow-x-auto border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr><th className="p-3">Order #</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Total</th><th className="p-3">Payment</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-white/50">Loading...</td></tr>}
            {(data?.orders ?? []).map((o) => (
              <tr key={o.id} className="border-t border-gold/5">
                <td className="p-3"><Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-gold hover:underline">{o.order_number}</Link></td>
                <td className="p-3 text-white">
                  <p>{o.customer_name}</p>
                  <p className="text-xs text-white/50">{o.customer_email}</p>
                </td>
                <td className="p-3 text-white/60">{new Date(o.created_at!).toLocaleDateString()}</td>
                <td className="p-3 font-mono text-white">€{Number(o.total).toFixed(2)}</td>
                <td className="p-3 text-xs capitalize text-white/70">{o.payment_status}</td>
                <td className="p-3">
                  <select
                    value={o.status ?? "pending"}
                    onChange={(e) => updateStatus.mutate({ id: o.id, status: e.target.value })}
                    className="border border-gold/20 bg-[#0D0D0D] px-2 py-1 text-xs text-white"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {!isLoading && !data?.orders.length && <tr><td colSpan={6} className="p-6 text-center text-white/50">No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
