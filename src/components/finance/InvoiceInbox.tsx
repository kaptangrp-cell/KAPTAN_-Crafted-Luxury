import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { financeInvoiceIntake } from "@/lib/finance-documents.functions";
import { financeAutomation } from "@/lib/finance-automation.functions";
import { useAuthStore } from "@/stores/authStore";

export function InvoiceInbox({ navigate }: { navigate: (tab: string) => void }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de");
  const user = useAuthStore((s) => s.user?.id);
  const read = useServerFn(financeInvoiceIntake),
    automation = useServerFn(financeAutomation);
  const q = useQuery({
    queryKey: ["finance-intake", user, "summary"],
    queryFn: () => read({ data: { ids: [] } }),
    enabled: !!user,
  });
  const a = useQuery({
    queryKey: ["finance-automation", user],
    queryFn: () => automation({ data: { action: "read" } }),
    enabled: !!user,
  });
  return (
    <section className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
      <h2 className="text-xl text-gold">
        {de ? "Rechnungen → Buchhaltung" : "Invoices → accounting"}
      </h2>
      <p className="mt-2 text-sm text-white/70">
        {de
          ? "Beleg hochladen → Angaben prüfen → Ausgabe buchen → tatsächliche Zahlung erfassen. Die Übersicht zeigt gebuchte Ausgaben; die EÜR berücksichtigt Zahlungen."
          : "Upload invoice → check details → record expense → record actual payment. The overview shows posted expenses; EÜR uses payments."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-lg border border-gold/30 px-4 py-3"
          onClick={() => navigate("documents")}
        >
          {q.data
            ? `${q.data.unassigned} ${de ? "nicht zugeordnete Originale" : "unassigned originals"} · ${q.data.drafts} ${de ? "Entwürfe" : "drafts"}`
            : de
              ? "Belege öffnen"
              : "Open documents"}{" "}
          →
        </button>
        <button
          className="rounded-lg border border-gold/30 px-4 py-3"
          onClick={() => navigate("automation")}
        >
          {de ? "Automatische Verkaufsbuchung" : "Automatic sales posting"}:{" "}
          {a.data ? (a.data.sales ? (de ? "An" : "On") : de ? "Aus" : "Off") : "…"} →
        </button>
      </div>
      <p className="mt-3 text-sm text-white/60">
        {de
          ? "Die Verkaufsautomatik verarbeitet ausgestellte Rechnungen. Automatische Rechnungserstellung und E-Mail-Versand benötigen zusätzlich den eingerichteten Server-Worker."
          : "Sales automation processes issued invoices. Automatic invoice generation and email delivery also require the server worker to be configured."}
      </p>
      {(q.error || a.error) && (
        <p role="alert" className="mt-2 text-red-300">
          {q.error?.message ?? a.error?.message}
        </p>
      )}
    </section>
  );
}
