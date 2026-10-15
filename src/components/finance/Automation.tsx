import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { financeAutomation } from "@/lib/finance-automation.functions";
import { useAuthStore } from "@/stores/authStore";
export function FinanceAutomation({ role }: { role: string }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    call = useServerFn(financeAutomation),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["finance-automation", user],
    queryFn: () => call({ data: { action: "read" } }),
    enabled: !!user,
    retry: false,
  });
  const [sales, setSales] = useState<boolean | null>(null),
    [stock, setStock] = useState<boolean | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">{say("Automatische Buchungen", "Automatic posting")}</h2>
      <p className="max-w-4xl text-neutral-400">
        {say(
          "Nur künftige unterstützte Vorgänge. §19-EUR-Rechnungen: bestätigte Anzahlung, Schlussrechnung, vollständige Gutschrift. QR-Bewegungen: historisch bewertete Einheiten. Erstattungszahlungen und Steuerzuordnungen benötigen weiterhin Belege und Prüfung.",
          "Future supported events only. §19 EUR invoices: verified advance, final invoice, full credit. QR movements: units with historical costs. Actual refunds and tax classifications still require evidence and review.",
        )}
      </p>
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.data && (
        <form
          className="space-y-4 rounded-xl border border-yellow-400/30 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await call({
                data: {
                  action: "save",
                  sales: sales ?? q.data.sales,
                  stock: stock ?? q.data.stock,
                  confirmed: true,
                },
              });
              setConfirmed(false);
              await qc.invalidateQueries({ queryKey: ["finance-automation"] });
              await qc.invalidateQueries({ queryKey: ["finance"] });
              toast.success(say("Einstellungen gespeichert", "Settings saved"));
            } catch (err) {
              toast.error(String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="flex gap-3">
            <input
              type="checkbox"
              disabled={role !== "owner" || busy}
              checked={sales ?? q.data.sales}
              onChange={(e) => {
                setSales(e.target.checked);
                setConfirmed(false);
              }}
            />
            {say(
              "Künftige ausgestellte Shop-Rechnungen automatisch buchen",
              "Automatically post future issued shop invoices",
            )}
          </label>
          <label className="flex gap-3">
            <input
              type="checkbox"
              disabled={role !== "owner" || busy}
              checked={stock ?? q.data.stock}
              onChange={(e) => {
                setStock(e.target.checked);
                setConfirmed(false);
              }}
            />
            {say(
              "Künftige QR-Kostenbewegungen automatisch buchen",
              "Automatically post future QR cost movements",
            )}
          </label>
          <p className="text-amber-200">
            {say(
              "Fehlende Belege/Kosten, geschlossene Perioden oder nicht unterstützte Fälle bleiben zur Prüfung stehen. Keine stillschweigende historische Nachbuchung. Prüfen Sie regelmäßig Shop-Buchungseingang und Inventar & Kosten.",
              "Missing sources/costs, closed periods and unsupported cases remain for review. No silent historical backfill. Check Store accounting inbox and Inventory & costs regularly.",
            )}
          </p>
          <p className="text-sm text-neutral-400">
            {say("Letzte Festlegung", "Last policy change")}: {q.data.enabled_from}
          </p>
          {role === "owner" && (
            <>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {say(
                  "Ich bestätige die Buchungsregeln und beauftrage die Verarbeitung künftiger Vorgänge.",
                  "I confirm the posting rules and authorize processing of future events.",
                )}
              </label>
              <button
                className="rounded-lg bg-yellow-400 px-4 py-2 text-black disabled:opacity-40"
                disabled={busy || !confirmed}
              >
                {say("Einstellungen speichern", "Save settings")}
              </button>
            </>
          )}
        </form>
      )}
    </section>
  );
}
