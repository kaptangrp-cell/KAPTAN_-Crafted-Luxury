import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  financeCostsList,
  financeCostPost,
  financeCostProcess,
  financeImportPay,
} from "@/lib/finance-costs.functions";
import { listFinanceDocuments } from "@/lib/finance-documents.functions";
import { costShipment, type ShipmentInput } from "@/lib/finance/costing";
import { euros, cents } from "@/lib/finance/money";
const field = "w-full rounded-lg border border-white/20 bg-neutral-950 p-3 text-white";
const button = "rounded-lg bg-[#FFD700] px-4 py-2 text-black disabled:opacity-40";
type CashAccount = { code: string; name_de: string; cash_kind?: "bank" | "cash" | null };
export function FinanceCosts({ role, accounts }: { role: string; accounts: CashAccount[] }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient();
  const read = useServerFn(financeCostsList),
    post = useServerFn(financeCostPost),
    process = useServerFn(financeCostProcess),
    pay = useServerFn(financeImportPay),
    docs = useServerFn(listFinanceDocuments);
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [selected, setSelected] = useState<Record<string, { purchase: string; weight: string }>>({});
  const [reference, setReference] = useState(""),
    [supplier, setSupplier] = useState(""),
    [date, setDate] = useState(""),
    [currency, setCurrency] = useState("EUR"),
    [num, setNum] = useState("1"),
    [den, setDen] = useState("1"),
    [rateDate, setRateDate] = useState(""),
    [rateSource, setRateSource] = useState("EUR 1:1"),
    [method, setMethod] = useState<ShipmentInput["method"]>("quantity");
  const [components, setComponents] = useState([
      {
        kind: "purchase" as ShipmentInput["components"][number]["kind"],
        document: "",
        reference: "",
        amount: "",
      },
    ]),
    [review, setReview] = useState<ReturnType<typeof costShipment> | null>(null),
    [docSearch, setDocSearch] = useState("");
  const query = useQuery({
    queryKey: ["finance-costs", user, search, page],
    queryFn: () => read({ data: { search, page } }),
    enabled: !!user,
    retry: false,
  });
  const originals = useQuery({
    queryKey: ["finance-cost-docs", user, docSearch],
    queryFn: () => docs({ data: { search: docSearch, page: 0 } }),
    enabled: !!user,
    retry: false,
  });
  const [payment, setPayment] = useState<{ id: string; document: string } | null>(null),
    [evidence, setEvidence] = useState(""),
    [paidOn, setPaidOn] = useState(""),
    [paidAmount, setPaidAmount] = useState(""),
    [paidAccount, setPaidAccount] = useState("BANK");
  const canPost = ["owner", "accountant"].includes(role);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await Promise.all(
        ["finance-costs", "finance"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const total = query.data?.totals;
  return (
    <section className="space-y-6">
      <h2 className="text-2xl">{say("Inventar & Importkosten", "Inventory & import costs")}</h2>
      <p className="text-neutral-400">
        {say(
          "Einzelbewertung je QR-Einheit. Kostenbuchung verändert keinen Lagerbestand. Nicht abzugsfähige Steuern sind Teil der Anschaffungskosten (§19-Modus). EÜR-Zahlungen werden separat behandelt.",
          "Specific cost per QR unit. Cost posting does not change warehouse stock. Non-recoverable taxes are included in acquisition cost (§19 mode). EÜR payments are handled separately.",
        )}
      </p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {total && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [say("Bewerteter Bestand", "Costed stock"), euros(total.costedValue, de)],
            [say("Bestandskonto", "Stock ledger"), euros(total.ledgerValue, de)],
            [say("Ohne historische Kosten", "Missing historical cost"), total.uncosted],
            [say("Offene Bewegungen", "Pending movements"), total.pending],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/20 p-4">
              <p>{label}</p>
              <strong className="text-xl text-yellow-300">{value}</strong>
            </div>
          ))}
        </div>
      )}
      {total && total.costedValue !== total.ledgerValue && (
        <p role="alert" className="text-amber-200">
          {say(
            "Bewertung und Bestandskonto weichen ab. Manuelle Bestandsbuchungen prüfen.",
            "Valuation and inventory ledger differ. Review manual inventory postings.",
          )}
        </p>
      )}
      <label className="block">
        {say("Produkt suchen oder QR-Einheiten-ID", "Product search or QR unit ID")}
        <input
          className={field}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "",
                say("Produkt / Variante / QR", "Product / variant / QR"),
                say("Status", "State"),
                say("Buchwert", "Book cost"),
                say("Einkauf je Einheit (Fremdwährung)", "Purchase per unit (foreign currency)"),
                say("Gewicht / freie Gewichtung", "Weight / manual weight"),
              ].map((v, i) => (
                <th className="p-2" key={i}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data?.units.map((u) => (
              <tr key={u.id}>
                <td className="p-2">
                  {canPost &&
                    u.original_cost === null &&
                    ["available", "reserved", "packed"].includes(u.state) && (
                      <input
                        type="checkbox"
                        aria-label={u.id}
                        checked={!!selected[u.id]}
                        onChange={(e) => {
                          const next = { ...selected };
                          if (e.target.checked) next[u.id] = { purchase: "", weight: "1" };
                          else delete next[u.id];
                          setSelected(next);
                          setReview(null);
                        }}
                      />
                    )}
                </td>
                <td className="p-2">
                  {u.name} · {u.variant_value}
                  <small className="block break-all">{u.id}</small>
                </td>
                <td className="p-2">{u.state}</td>
                <td className="p-2">{u.book_cost === null ? "—" : euros(u.book_cost, de)}</td>
                {(["purchase", "weight"] as const).map((k) => (
                  <td className="p-2" key={k}>
                    {selected[u.id] && (
                      <input
                        aria-label={`${u.id} ${k}`}
                        className={field}
                        value={selected[u.id][k]}
                        onChange={(e) => {
                          setSelected({
                            ...selected,
                            [u.id]: { ...selected[u.id], [k]: e.target.value },
                          });
                          setReview(null);
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          {say("Zurück", "Previous")}
        </button>
        <span>{page + 1}</span>
        <button
          disabled={(query.data?.units.length ?? 0) < 100}
          onClick={() => setPage((p) => p + 1)}
        >
          {say("Weiter", "Next")}
        </button>
      </div>
      {canPost && (
        <details className="rounded-xl border border-yellow-400/30 p-5">
          <summary className="cursor-pointer text-lg">
            {say("Import / Anschaffungskosten erfassen", "Record shipment / acquisition cost")} (
            {Object.keys(selected).length})
          </summary>
          <form
            className="mt-4 space-y-4"
            onChange={() => setReview(null)}
            onSubmit={(e) => {
              e.preventDefault();
              try {
                setReview(
                  costShipment({
                    id: key,
                    reference,
                    supplier,
                    date,
                    currency: currency as ShipmentInput["currency"],
                    rateNumerator: num,
                    rateDenominator: den,
                    rateDate,
                    rateSource,
                    method,
                    units: Object.entries(selected).map(([id, v]) => ({
                      id,
                      purchase: cents(v.purchase),
                      weight: v.weight,
                    })),
                    components: components.map((c) => ({ ...c, amount: cents(c.amount) })),
                    confirmed: true,
                  }),
                );
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-3">
              {[
                [say("Sendungsreferenz", "Shipment reference"), reference, setReference, "text"],
                [say("Lieferant", "Supplier"), supplier, setSupplier, "text"],
                [say("Buchungsdatum", "Booking date"), date, setDate, "date"],
                [say("Währung (ISO)", "Currency (ISO)"), currency, setCurrency, "text"],
                [say("Kursdatum", "FX date"), rateDate, setRateDate, "date"],
                [
                  say("Kursquelle / Beleg", "FX source / evidence"),
                  rateSource,
                  setRateSource,
                  "text",
                ],
                [say("Kurs Zähler", "Rate numerator"), num, setNum, "text"],
                [say("Kurs Nenner", "Rate denominator"), den, setDen, "text"],
              ].map(([label, value, set, type]) => (
                <label key={String(label)}>
                  {String(label)}
                  <input
                    required
                    className={field}
                    type={String(type)}
                    value={String(value)}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  />
                </label>
              ))}
              <label>
                {say("Nebenkosten verteilen nach", "Allocate additional costs by")}
                <select
                  className={field}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  {[
                    ["quantity", "Menge", "Quantity"],
                    ["value", "Einkaufswert", "Purchase value"],
                    ["weight", "Gewicht (Gramm)", "Weight (grams)"],
                    ["manual", "Freie relative Gewichte", "Manual relative weights"],
                  ].map(([v, g, en]) => (
                    <option key={v} value={v}>
                      {say(g, en)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-sm text-neutral-400">
              {say(
                "Umrechnung: Fremdwährungs-Cent × Zähler ÷ Nenner = EUR-Cent. Alle Kostenkomponenten unten in EUR. Ein Einkaufsbeleg muss exakt der umgerechneten Summe entsprechen. Originale zuerst unter Dokumente hochladen.",
                "Conversion: foreign minor units × numerator ÷ denominator = EUR cents. All cost components below are in EUR. The purchase invoice must equal the converted total. Upload originals in Documents first.",
              )}
            </p>
            <label className="block">
              {say("Originale suchen (erste 30 Treffer)", "Find originals (first 30 matches)")}
              <input
                className={field}
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
              />
            </label>
            {originals.error && <p role="alert">{originals.error.message}</p>}
            {components.map((c, i) => (
              <div
                key={i}
                className="grid gap-3 rounded-lg border border-white/15 p-3 md:grid-cols-4"
              >
                <label>
                  {say("Kostenart", "Cost type")}
                  <select
                    className={field}
                    value={c.kind}
                    onChange={(e) =>
                      setComponents(
                        components.map((x, j) =>
                          j === i ? { ...x, kind: e.target.value as typeof c.kind } : x,
                        ),
                      )
                    }
                  >
                    {[
                      ["purchase", "Einkauf", "Purchase"],
                      ["freight", "Fracht", "Freight"],
                      ["insurance", "Versicherung", "Insurance"],
                      ["duty", "Zoll", "Customs duty"],
                      [
                        "import_vat",
                        "Einfuhrumsatzsteuer (nicht abzugsfähig)",
                        "Import VAT (non-recoverable)",
                      ],
                      ["clearance", "Zollabfertigung", "Clearance"],
                      ["other", "Sonstige", "Other"],
                    ].map(([v, g, en]) => (
                      <option value={v} key={v}>
                        {say(g, en)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {say("Original", "Original")}
                  <select
                    required
                    className={field}
                    value={c.document}
                    onChange={(e) =>
                      setComponents(
                        components.map((x, j) =>
                          j === i ? { ...x, document: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="">—</option>
                    {originals.data?.documents
                      .filter((d) => d.state === "ready")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.filename}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {say("Belegnummer", "Document reference")}
                  <input
                    required
                    className={field}
                    value={c.reference}
                    onChange={(e) =>
                      setComponents(
                        components.map((x, j) =>
                          j === i ? { ...x, reference: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  EUR
                  <input
                    required
                    className={field}
                    value={c.amount}
                    onChange={(e) =>
                      setComponents(
                        components.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                {i > 0 && (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setComponents(components.filter((_, j) => j !== i));
                      setReview(null);
                    }}
                  >
                    {say("Entfernen", "Remove")}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="underline"
              disabled={components.length >= 30}
              onClick={() => {
                setComponents([
                  ...components,
                  { kind: "freight", document: "", reference: "", amount: "" },
                ]);
                setReview(null);
              }}
            >
              {say("Kostenkomponente hinzufügen", "Add cost component")}
            </button>
            <br />
            <button className={button} disabled={busy || !Object.keys(selected).length}>
              {say("Berechnen & prüfen", "Calculate & review")}
            </button>
          </form>
          {review && (
            <div className="mt-5 space-y-3 border-t border-yellow-400/30 pt-4">
              <h3>
                {say("Gesamtbestand an Verbindlichkeiten", "Debit inventory / credit payables")}:{" "}
                {euros(review.total, de)}
              </h3>
              <div className="max-h-64 overflow-auto">
                {review.allocations.map((a) => (
                  <p className="break-all text-sm" key={a.id}>
                    {a.id} · {euros(a.amount, de)}
                  </p>
                ))}
              </div>
              <p className="text-amber-200">
                {say(
                  "Bestätigen: Originale geprüft, Kosten noch nicht verbucht, §19-Steuern nicht abzugsfähig. Keine Zahlung wird ausgelöst.",
                  "Confirm: originals reviewed, costs not already recorded, §19 taxes non-recoverable. No payment is initiated.",
                )}
              </p>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await post({ data: review });
                    setReview(null);
                    setSelected({});
                    setKey(crypto.randomUUID());
                    toast.success(say("Kosten gebucht", "Costs posted"));
                  })
                }
              >
                {say("Geprüfte Kosten verbindlich buchen", "Post reviewed costs")}
              </button>
            </div>
          )}
        </details>
      )}
      <h3 className="text-xl">
        {say("Offene QR-Kostenbewegungen (älteste 100)", "Pending QR cost movements (oldest 100)")}
      </h3>
      {query.data?.events.map((e) => (
        <article key={e.id} className="space-y-2 rounded-lg border border-white/15 p-4">
          <p className="break-all">
            #{e.id} · {e.unit_id} · {e.old_state ?? "—"} → {e.new_state}
          </p>
          <p>{e.created_at}</p>
          {e.last_error && <p className="text-amber-200">{e.last_error}</p>}
          {canPost && (
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await process({ data: { id: e.id, confirmed: true } });
                  if (r.error) throw new Error(r.error);
                })
              }
            >
              {say("Bewegung prüfen & Kosten buchen", "Review movement & post cost")}
            </button>
          )}
        </article>
      ))}
      {payment && (
        <form
          className="space-y-3 rounded-xl border border-yellow-400/30 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await pay({
                data: {
                  ...payment,
                  evidence,
                  date: paidOn,
                  amount: cents(paidAmount),
                  account: paidAccount,
                  confirmed: true,
                },
              });
              setPayment(null);
            });
          }}
        >
          <h3>
            {say(
              "Importkosten: tatsächliche Zahlung bestätigen",
              "Import costs: confirm actual payment",
            )}
          </h3>
          <label className="block">
            {say("Zahlungsbeleg (Suche oben)", "Payment evidence (search above)")}
            <select
              className={field}
              required
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            >
              <option value="">—</option>
              {originals.data?.documents
                .filter((d) => d.state === "ready")
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            {say("Zahlungsdatum", "Payment date")}
            <input
              className={field}
              type="date"
              required
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </label>
          <label className="block">
            EUR
            <input
              className={field}
              required
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </label>
          <label className="block">
            {say("Konto", "Account")}
            <select
              className={field}
              value={paidAccount}
              onChange={(e) => setPaidAccount(e.target.value)}
            >
              {accounts
                .filter((a) => a.cash_kind || ["BANK", "CASH"].includes(a.code))
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name_de}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex gap-3">
            <input type="checkbox" required />
            {say(
              "Tatsächliche Zahlung geprüft, noch nicht verbucht. Keine Überweisung wird ausgelöst.",
              "Actual payment verified, not already recorded. No transfer is initiated.",
            )}
          </label>
          <button className={button} disabled={busy}>
            {say("Zahlung buchen", "Post payment")}
          </button>
          <button className="ml-4 underline" type="button" onClick={() => setPayment(null)}>
            {say("Abbrechen", "Cancel")}
          </button>
        </form>
      )}
      <h3 className="text-xl">{say("Letzte 50 Sendungen", "Latest 50 shipments")}</h3>
      {query.data?.shipments.map((s) => (
        <article key={s.id} className="rounded-lg border border-white/15 p-4">
          <p>
            {s.reference} · {s.supplier} · {s.booking_date} · {euros(s.total, de)}
          </p>
          <small className="break-all">{s.journal_id}</small>
          {s.components.map((c) => (
            <div
              key={c.document + ":" + c.kind}
              className="mt-3 flex flex-wrap items-center justify-between gap-3"
            >
              <span>
                {c.reference} · {c.kind} · {euros(c.amount, de)} · {say("Bezahlt", "Paid")}:{" "}
                {euros(c.paid, de)}
              </span>
              {canPost && BigInt(c.paid) < BigInt(c.amount) && (
                <button
                  className={button}
                  onClick={() => {
                    setPayment({ id: crypto.randomUUID(), document: c.document });
                    setPaidAmount("");
                    setEvidence("");
                  }}
                >
                  {say("Zahlung erfassen", "Record payment")}
                </button>
              )}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
