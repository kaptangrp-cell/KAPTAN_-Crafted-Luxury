import { useState } from "react";
import { AdminFeedback } from "@/components/admin/AdminFeedback";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminListCustomers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const fn = useServerFn(adminListCustomers);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => fn(),
  });

  const visibleCustomers = (data?.customers ?? []).filter((c) =>
    `${c.full_name ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-white">{t("adminCustomers.title")}</h1>

      <label className="block text-xs text-white/60">
        {t("adminWorkspace.searchCustomers")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full rounded-lg border border-gold/20 bg-[#0D0D0D] px-4 py-3 text-sm text-white"
        />
      </label>
      <p className="text-xs text-white/50">{t("adminWorkspace.customerScope")}</p>
      {isError && <AdminFeedback retry={() => void refetch()} />}
      <div className="overflow-x-auto rounded-2xl border border-gold/15 bg-[#0D0D0D]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">{t("adminCustomers.colName")}</th>
              <th className="p-3">{t("adminCustomers.colPhone")}</th>
              <th className="p-3">{t("adminCustomers.colRole")}</th>
              <th className="p-3">{t("adminCustomers.colJoined")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/50">
                  {t("adminProducts.loading")}
                </td>
              </tr>
            )}
            {visibleCustomers.map((c) => (
              <tr key={c.id} className="border-t border-gold/5">
                <td className="p-3 text-white">{c.full_name ?? "—"}</td>
                <td className="p-3 text-white/60">{c.phone ?? "—"}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${c.role === "admin" ? "bg-gold/20 text-gold" : "bg-white/5 text-white/60"}`}
                  >
                    {t(
                      c.role === "admin" ? "admin.navSectionLabel" : "adminWorkspace.customerRole",
                    )}
                  </span>
                </td>
                <td className="p-3 text-white/60">
                  {new Date(c.created_at!).toLocaleDateString(
                    i18n.language === "de" ? "de-DE" : "en-GB",
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !isError && !visibleCustomers.length && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-white/60">
                  {t("adminWorkspace.noMatches")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
