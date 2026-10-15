import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { financeAssets, financeAssetSave } from "@/lib/finance-assets.functions";
import { euros } from "@/lib/finance/money";
const field = "w-full rounded border border-white/20 bg-neutral-950 p-2";
export function FinanceAssets({ role }: { role: string }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    read = useServerFn(financeAssets),
    save = useServerFn(financeAssetSave),
    qc = useQueryClient();
  const [through, setThrough] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false),
    [id, setId] = useState(() => crypto.randomUUID()),
    [name, setName] = useState(""),
    [document, setDocument] = useState(""),
    [journal, setJournal] = useState(""),
    [start, setStart] = useState(""),
    [months, setMonths] = useState("60"),
    [basis, setBasis] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const q = useQuery({
    queryKey: ["finance-assets", user, through],
    queryFn: () => read({ data: { through } }),
    enabled: !!user && !!through,
    retry: false,
  });
  const canPost = ["owner", "accountant"].includes(role);
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["finance-assets"] }),
      qc.invalidateQueries({ queryKey: ["finance"] }),
    ]);
  }
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">
        {say("Anlagenregister & lineare Abschreibung", "Fixed assets & straight-line depreciation")}
      </h2>
      <p className="rounded border border-amber-400/30 p-3 text-amber-100">
        {say(
          "Internes Anlagenregister. Nutzungsdauer und Aktivierung fachlich prüfen. Keine automatische steuerliche AfA, GWG- oder degressive Berechnung. Zahlungen und EÜR-Zuordnung getrennt prüfen.",
          "Internal asset register. Review capitalization and useful life. No automatic tax depreciation, low-value asset or declining-balance treatment. Review payments and EÜR classification separately.",
        )}
      </p>
      <label className="block">
        {say(
          "Abschreibung bis (abgeschlossener Monatsletzter)",
          "Depreciation through (completed month end)",
        )}
        <input
          type="date"
          className={field}
          value={through}
          onChange={(e) => setThrough(e.target.value)}
        />
      </label>
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.isPending && <p role="status">{say("Wird geladen…", "Loading…")}</p>}
      {q.data?.length === 0 && (
        <p>{say("Noch keine Anlagen registriert.", "No assets registered yet.")}</p>
      )}
      {q.data?.map((a) => (
        <article key={a.id} className="space-y-2 rounded-xl border border-white/20 p-4">
          <h3 className="text-lg">{a.name}</h3>
          <p>
            {a.start_date} · {a.months} {say("Monate", "months")}
          </p>
          <p>
            {say("Anschaffung", "Cost")}: {euros(a.cost, de)} ·{" "}
            {say("Abgeschrieben", "Depreciated")}: {euros(a.depreciated, de)} ·{" "}
            {say("Buchwert", "Book value")}: {euros(a.book_value, de)}
          </p>
          <p className="text-sm">{a.basis}</p>
          <p>
            {say("Vorschlag bis Stichtag", "Proposed through selected date")}:{" "}
            {euros(a.proposed, de)}
          </p>
          {canPost && BigInt(a.proposed) > 0n && (
            <button
              disabled={busy}
              className="rounded bg-yellow-400 px-4 py-2 text-black disabled:opacity-40"
              onClick={async () => {
                setBusy(true);
                try {
                  await save({ data: { action: "depreciate", id: a.id, through } });
                  await refresh();
                  toast.success(say("Gebucht", "Posted"));
                } catch (e) {
                  toast.error(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {say("Lineare Abschreibung buchen", "Post straight-line depreciation")}
            </button>
          )}
        </article>
      ))}
      {canPost && (
        <details className="rounded-xl border border-white/20 p-4">
          <summary>{say("Anlage registrieren", "Register an asset")}</summary>
          <p className="my-3 text-sm">
            {say(
              "Zuerst den geprüften Anschaffungsbetrag im Journal auf FIXED_ASSETS buchen. Als Belegreferenz die UUID des hochgeladenen Originals verwenden. Die Registrierung erzeugt keine zweite Anschaffungsbuchung.",
              "First post the reviewed capitalization to FIXED_ASSETS in the journal, with the uploaded original's UUID as source reference. Registration does not create a second purchase posting.",
            )}
          </p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!confirmed) return;
              setBusy(true);
              try {
                await save({
                  data: {
                    action: "register",
                    id,
                    document,
                    journal,
                    name,
                    start,
                    months: Number(months),
                    basis,
                  },
                });
                setId(crypto.randomUUID());
                setName("");
                setDocument("");
                setJournal("");
                setBasis("");
                setConfirmed(false);
                await refresh();
              } catch (err) {
                toast.error(String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {[
              [say("Bezeichnung", "Name"), name, setName],
              [say("Original-Beleg UUID", "Original document UUID"), document, setDocument],
              [say("Aktivierungsbuchung UUID", "Capitalization journal UUID"), journal, setJournal],
              [
                say("Geprüfte Nutzungsdauer: Grundlage", "Reviewed useful-life basis"),
                basis,
                setBasis,
              ],
            ].map(([label, value, setter]) => (
              <label className="block" key={String(label)}>
                {String(label)}
                <input
                  className={field}
                  required
                  value={String(value)}
                  onChange={(e) => (setter as (s: string) => void)(e.target.value)}
                />
              </label>
            ))}
            <label className="block">
              {say("Betriebsbereit ab", "In service from")}
              <input
                type="date"
                className={field}
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="block">
              {say("Nutzungsdauer in Monaten", "Useful life in months")}
              <input
                type="number"
                min="1"
                max="1200"
                className={field}
                required
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {say(
                "Original, Aktivierung, Datum und Nutzungsdauer geprüft.",
                "I reviewed the original, capitalization, date and useful life.",
              )}
            </label>
            <button disabled={busy} className="rounded bg-yellow-400 px-4 py-2 text-black">
              {say("Registrieren", "Register")}
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
