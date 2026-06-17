import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminListCustomers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const fn = useServerFn(adminListCustomers);
  const { data, isLoading } = useQuery({ queryKey: ["admin-customers"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-white">Customers</h1>

      <div className="border border-gold/15 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Role</th><th className="p-3">Joined</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="p-6 text-center text-white/50">Loading...</td></tr>}
            {(data?.customers ?? []).map((c) => (
              <tr key={c.id} className="border-t border-gold/5">
                <td className="p-3 text-white">{c.full_name ?? "—"}</td>
                <td className="p-3 text-white/60">{c.phone ?? "—"}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.role === "admin" ? "bg-gold/20 text-gold" : "bg-white/5 text-white/60"}`}>
                    {c.role}
                  </span>
                </td>
                <td className="p-3 text-white/60">{new Date(c.created_at!).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
