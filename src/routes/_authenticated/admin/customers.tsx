import { useState } from "react";
import { AdminFeedback } from "@/components/admin/AdminFeedback";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminManageCustomer, adminListCustomers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  const manage = useServerFn(adminManageCustomer);
  const [editing, setEditing] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function apply(action: "edit" | "delete", id: string, name = "", phone = "") {
    setBusy(true);
    setError("");
    try {
      await manage({ data: { action, id, name, phone } });
      setEditing(null);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
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
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {editing && (
        <form
          className="space-y-3 rounded-xl border border-gold/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void apply("edit", editing.id, editing.name, editing.phone);
          }}
        >
          <label className="block">
            {de ? "Name" : "Name"}
            <input
              className="warehouse-input w-full"
              maxLength={200}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className="block">
            {de ? "Telefon" : "Phone"}
            <input
              className="warehouse-input w-full"
              maxLength={40}
              value={editing.phone}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
          </label>
          <button disabled={busy} className="warehouse-button">
            {de ? "Speichern" : "Save"}
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            className="warehouse-button"
            onClick={() => setEditing(null)}
          >
            {de ? "Abbrechen" : "Cancel"}
          </button>
        </form>
      )}
      {isError && <AdminFeedback retry={() => void refetch()} />}
      <div className="overflow-x-auto rounded-2xl border border-gold/15 bg-[#0D0D0D]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="p-3">{t("adminCustomers.colName")}</th>
              <th className="p-3">{t("adminCustomers.colPhone")}</th>
              <th className="p-3">{t("adminCustomers.colRole")}</th>
              <th className="p-3">{t("adminCustomers.colJoined")}</th>
              <th className="p-3">{de ? "Aktionen" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/50">
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
                <td className="p-3">
                  {c.role === "customer" && (
                    <div className="flex gap-3">
                      <button
                        disabled={busy}
                        className="text-gold underline"
                        onClick={() =>
                          setEditing({ id: c.id, name: c.full_name ?? "", phone: c.phone ?? "" })
                        }
                      >
                        {de ? "Bearbeiten" : "Edit"}
                      </button>
                      <button
                        disabled={busy}
                        className="text-red-300 underline"
                        onClick={() => {
                          if (
                            window.confirm(
                              de
                                ? "Kundenkonto und persönliche Kontodaten dauerhaft löschen? Konten mit Bestellungen oder Mitarbeiterrechten bleiben geschützt."
                                : "Permanently delete this customer account and its personal account data? Accounts with orders or staff access remain protected.",
                            )
                          )
                            void apply("delete", c.id);
                        }}
                      >
                        {de ? "Löschen" : "Delete"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !isError && !visibleCustomers.length && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-white/60">
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
