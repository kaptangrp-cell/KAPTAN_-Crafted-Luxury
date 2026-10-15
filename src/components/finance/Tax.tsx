import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { financeTaxList, financeTaxReview } from "@/lib/finance-tax.functions";
import { listFinanceDocuments } from "@/lib/finance-documents.functions";
import { useAuthStore } from "@/stores/authStore";
import { euros } from "@/lib/finance/money";
import { bankAmount } from "@/lib/finance/bank-csv";
const field = "w-full rounded-lg border border-white/20 bg-neutral-950 p-3 text-white",
  button = "rounded-lg bg-[#FFD700] px-4 py-2 text-black disabled:opacity-40";
type Journal = Awaited<ReturnType<typeof financeTaxList>>["journals"][number];
type Category = "receipts" | "goods" | "operating" | "fees" | "asset" | "excluded";
export function FinanceTax({ role }: { role: string }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient(),
    read = useServerFn(financeTaxList);
  const [year, setYear] = useState(2026),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<Journal | null>(null);
  const q = useQuery({
    queryKey: ["finance-tax", user, year, page],
    queryFn: () => read({ data: { year, page } }),
    enabled: !!user,
    retry: false,
  });
  const d = q.data,
    net =
      d?.totals
        .filter((t) => !["asset", "excluded"].includes(t.category))
        .reduce((sum, t) => sum + BigInt(t.amount), 0n)
        .toString() ?? "0";
  const names: Record<Category, string> = {
    receipts: say("Betriebseinnahmen / Rückzahlungen", "Business receipts / repayments"),
    goods: say("Bezahlte Waren / Importkosten", "Paid goods / import costs"),
    operating: say("Betriebsausgaben", "Operating expenses"),
    fees: say("Gebühren", "Fees"),
    asset: say("Anlagen: AfA-Prüfung offen", "Assets: depreciation review pending"),
    excluded: say("Nicht ergebniswirksam / Umbuchung", "Excluded / transfer"),
  };
  function csv() {
    if (!d) return;
    const rows = [
      ["KAPTAN", "EÜR review draft / Prüfentwurf", String(year)],
      ["Category", "Signed EUR cents"],
      ...d.totals.map((t) => [t.category, t.amount]),
      ["Draft result", net],
      ["Reviewed turnover only", d.turnover],
      ["Unreviewed journals", d.unreviewed],
      ["NOT FILED / NICHT EINGEREICHT", "No official form-line mapping"],
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\uFEFF" +
            rows
              .map((r) => r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(";"))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `Kaptan-EUER-review-${year}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">{say("Steuerprüfung & EÜR-Entwurf", "Tax review & EÜR draft")}</h2>
      <p className="max-w-4xl text-amber-200">
        {say(
          "Prüfentwurf aus bestätigten Zahlungszuordnungen, keine Steuererklärung. Abschreibungen, private Anteile, Sonderfälle und amtliche Formularzuordnung sind gesondert zu prüfen. §19: kein normaler Vorsteuerabzug. Es wird nichts an ELSTER übermittelt.",
          "Review draft from confirmed payment classifications, not a tax return. Depreciation, private portions, special cases and official form mapping need separate review. §19: no ordinary input VAT recovery. Nothing is submitted to ELSTER.",
        )}
      </p>
      <label>
        {say("Kalenderjahr", "Calendar year")}
        <input
          className={field}
          type="number"
          min={2026}
          max={2100}
          value={year}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 2026 && v <= 2100) {
              setYear(v);
              setPage(0);
              setSelected(null);
            }
          }}
        />
      </label>
      {q.error && <p role="alert">{q.error.message}</p>}
      {d && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              [say("Vorläufiges Ergebnis", "Draft result"), euros(net, de)],
              [say("Ungeprüfte Zahlungsbuchungen", "Unreviewed payment journals"), d.unreviewed],
              [say("Buchungsentwürfe", "Draft journals"), d.drafts],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/20 p-4">
                <p>{label}</p>
                <strong className="text-2xl text-yellow-300">{value}</strong>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-yellow-400/30 p-5">
            <h3>
              §19{" "}
              {say("Umsatzmonitor (nur geprüfte Daten)", "Turnover monitor (reviewed data only)")}
            </h3>
            <p>
              {euros(d.turnover, de)} / {euros(d.rules.currentLimit, de)}
            </p>
            <p>
              {say(
                "Gründungsjahr 2026: 25.000 EUR. Folgejahre: Vorjahr höchstens 25.000 EUR, laufendes Jahr höchstens 100.000 EUR. Überschreitender Umsatz erfordert sofortige Prüfung.",
                "First year 2026: EUR 25,000. Later years: previous year at most EUR 25,000 and current year at most EUR 100,000. The crossing transaction requires immediate review.",
              )}
            </p>
            {BigInt(d.positiveTurnover) * 100n >= BigInt(d.rules.currentLimit) * 80n && (
              <p role="alert" className="mt-2 font-bold text-amber-200">
                {say(
                  "Geprüfte Bruttoeingänge nähern sich der Grenze. Überschreitungsdatum auch bei späteren Rückzahlungen prüfen.",
                  "Gross reviewed receipts approach the threshold. Check crossing dates even if subsequent refunds reduced the balance.",
                )}
              </p>
            )}
            {year > 2026 && BigInt(d.previousTurnover) > BigInt(d.rules.previousLimit) && (
              <p role="alert">
                {say(
                  "Geprüfter Vorjahresumsatz überschreitet die Vorjahresgrenze.",
                  "Reviewed previous-year turnover exceeds the prior-year limit.",
                )}
              </p>
            )}
            <p className="mt-2 text-sm text-neutral-400">
              {say(
                "Unvollständige Daten, Rückzahlungen, andere Tätigkeiten und Umsatz-Ausnahmen können die Beurteilung ändern. Dieser Monitor bestätigt keine Berechtigung und schaltet die Shop-Steuer nicht automatisch um. Rechtsstand geprüft:",
                "Incomplete data, repayments, other business activities and turnover exclusions can change the assessment. This monitor does not confirm eligibility or switch store tax settings automatically. Rules checked:",
              )}{" "}
              {d.rules.verifiedOn}
            </p>
            <a
              className="underline"
              href="https://finanzamt.hessen.de/steuern/umsatzsteuer-kleinunternehmer"
              target="_blank"
              rel="noreferrer"
            >
              {say("Amtliche Hinweise Hessen", "Official Hessen guidance")}
            </a>
          </div>
          <div className="space-y-2">
            {d.totals.map((t) => (
              <p key={t.category} className="flex justify-between gap-3">
                <span>{names[t.category as Category]}</span>
                <span>{euros(t.amount, de)}</span>
              </p>
            ))}
          </div>
          <button className={button} onClick={csv}>
            {say("Prüfentwurf als CSV", "Export review draft CSV")}
          </button>
          <p>
            {say("Geschlossene Buchungsperioden", "Closed ledger periods")}: {d.closedPeriods}/12
          </p>
          <p className="text-sm text-neutral-400">
            {say(
              "Vor Jahresabschluss: Bank abstimmen, offene Shop-/Lagerereignisse prüfen, alle Zahlungen und Belege zuordnen, Anlagen und Sonderfälle prüfen, Steuerberaterfreigabe einholen. Perioden erst danach unter Buchhaltung schließen.",
              "Before year close: reconcile banks, review outstanding store/stock events, classify payments and evidence, review assets and special cases, obtain accountant approval. Close ledger periods afterwards.",
            )}
          </p>
          {selected && (
            <TaxForm
              key={selected.id + String(selected.review?.id)}
              journal={selected}
              names={names}
              de={de}
              done={async () => {
                setSelected(null);
                await qc.invalidateQueries({ queryKey: ["finance-tax"] });
                await qc.invalidateQueries({ queryKey: ["finance"] });
              }}
            />
          )}
          <h3 className="text-xl">{say("Zahlungsbuchungen prüfen", "Review payment journals")}</h3>
          {d.journals.map((j) => (
            <article key={j.id} className="space-y-2 rounded-xl border border-white/15 p-4">
              <p>
                {j.booking_date} · {j.memo} · {euros(j.net, de)}
              </p>
              <small className="block break-all">{j.id}</small>
              <p>
                {j.review
                  ? say("Zuordnung gespeichert", "Classification saved")
                  : say("Prüfung offen", "Review pending")}
              </p>
              {j.reversal_of && (
                <p className="text-amber-200">
                  {say(
                    "Stornobuchung: kein Beweis einer tatsächlichen Rückzahlung. Original und Korrektur gemeinsam prüfen.",
                    "Reversal journal: not proof of an actual repayment. Review original and correction together.",
                  )}
                </p>
              )}
              {["owner", "accountant"].includes(role) && (
                <button className={button} onClick={() => setSelected(j)}>
                  {j.review
                    ? say("Korrektur erfassen", "Record correction")
                    : say("Zuordnen", "Classify")}
                </button>
              )}
            </article>
          ))}
          <div className="flex gap-4">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              {say("Zurück", "Previous")}
            </button>
            <span>{page + 1}</span>
            <button disabled={d.journals.length < 30} onClick={() => setPage((p) => p + 1)}>
              {say("Weiter", "Next")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function TaxForm({
  journal,
  names,
  de,
  done,
}: {
  journal: Journal;
  names: Record<Category, string>;
  de: boolean;
  done: () => Promise<void>;
}) {
  const say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    read = useServerFn(listFinanceDocuments),
    save = useServerFn(financeTaxReview);
  const major = (v: string) => {
    const n = BigInt(v);
    return `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100n}.${((n < 0n ? -n : n) % 100n).toString().padStart(2, "0")}`;
  };
  const [id] = useState(() => crypto.randomUUID()),
    [date, setDate] = useState(journal.review?.tax_date ?? journal.booking_date),
    [document, setDocument] = useState(journal.review?.document_id ?? ""),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(
    (
      journal.review?.allocations ?? [
        { category: "excluded" as Category, amount: journal.net, turnover: "0" },
      ]
    ).map((a) => ({ ...a, amount: major(a.amount), turnover: major(a.turnover) })),
  );
  const q = useQuery({
    queryKey: ["finance-tax-docs", user, search],
    queryFn: () => read({ data: { search, page: 0 } }),
    enabled: !!user,
    retry: false,
  });
  return (
    <form
      className="space-y-4 rounded-xl border border-yellow-400/30 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const parsed = rows.map((r) => ({
            ...r,
            amount: bankAmount(r.amount.replace(",", "."), "english"),
            turnover: bankAmount(r.turnover.replace(",", "."), "english"),
          }));
          await save({
            data: {
              id,
              journal: journal.id,
              date,
              document,
              reason,
              allocations: parsed,
              replaces: journal.review?.id ?? null,
              confirmed: true,
            },
          });
          await done();
        } catch (err) {
          toast.error(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{journal.memo}</h3>
      <p className="text-sm text-amber-200">
        {say(
          "Beträge mit Vorzeichen: Einnahmen positiv, Ausgaben negativ; Rückzahlungen umgekehrt. Summe muss der Zahlungsbewegung entsprechen. Umbuchungen, Einlagen/Entnahmen, Korrekturen und Management-COGS nicht doppelt als steuerwirksam zählen. Datumsabweichung nur mit geprüfter Rechtsgrundlage, keine automatische 10-Tage-Regel.",
          "Signed amounts: receipts positive, expenses negative; repayments reverse the sign. Sum must equal payment movement. Do not count transfers, owner funds, corrections or management COGS twice for tax. Date differences require a reviewed legal basis; no automatic ten-day rule.",
        )}
      </p>
      <label className="block">
        {say("Steuerliches Zuordnungsdatum", "Tax allocation date")}
        <input
          className={field}
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="block">
        {say("Beleg suchen", "Find evidence")}
        <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {q.error && <p role="alert">{q.error.message}</p>}
      <label className="block">
        {say("Originalbeleg", "Original evidence")}
        <select
          className={field}
          required
          value={document}
          onChange={(e) => setDocument(e.target.value)}
        >
          <option value="">—</option>
          {document && !q.data?.documents.some((d) => d.id === document) && (
            <option value={document}>{document}</option>
          )}
          {q.data?.documents
            .filter((d) => d.state === "ready")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
        </select>
      </label>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-3 md:grid-cols-3">
          <label>
            {say("Kategorie", "Category")}
            <select
              className={field}
              value={r.category}
              onChange={(e) =>
                setRows(
                  rows.map((x, j) =>
                    i === j ? { ...x, category: e.target.value as Category } : x,
                  ),
                )
              }
            >
              {Object.entries(names).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            {say("Betrag EUR (mit Vorzeichen)", "Amount EUR (signed)")}
            <input
              required
              className={field}
              value={r.amount}
              onChange={(e) =>
                setRows(rows.map((x, j) => (i === j ? { ...x, amount: e.target.value } : x)))
              }
            />
          </label>
          <label>
            {say("Davon §19-Gesamtumsatz EUR", "Of which §19 turnover EUR")}
            <input
              required
              className={field}
              value={r.turnover}
              onChange={(e) =>
                setRows(rows.map((x, j) => (i === j ? { ...x, turnover: e.target.value } : x)))
              }
            />
          </label>
          {i > 0 && (
            <button
              type="button"
              className="underline"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              {say("Entfernen", "Remove")}
            </button>
          )}
        </div>
      ))}
      <button
        className="underline"
        type="button"
        disabled={rows.length >= 50}
        onClick={() => setRows([...rows, { category: "excluded", amount: "0", turnover: "0" }])}
      >
        {say("Aufteilen", "Add allocation")}
      </button>
      <label className="block">
        {say(
          "Prüfvermerk / Rechtsgrundlage / Korrekturgrund",
          "Review note / legal basis / correction reason",
        )}
        <textarea
          required
          minLength={10}
          maxLength={1000}
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-3">
        <input type="checkbox" required />
        {say(
          "Original, tatsächliche Zahlung, Zuordnung und Umsatz-Ausnahmen geprüft.",
          "Original, actual payment, classification and turnover exclusions reviewed.",
        )}
      </label>
      <button className={button} disabled={busy}>
        {say("Prüfung speichern", "Save review")}
      </button>
    </form>
  );
}
