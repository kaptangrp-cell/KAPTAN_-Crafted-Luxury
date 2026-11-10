import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  adminManageRecord,
  completeFestivalSale,
  listFestivalSales,
  type FestivalSale,
  lookupUnit,
  listFestivalBaskets,
  saveFestivalBasket,
  type TracedUnit,
} from "@/lib/operations.functions";
import { useAuthStore } from "@/stores/authStore";
import { QrCamera } from "./QrCamera";
export function FestivalBasket({ expanded = false }: { expanded?: boolean }) {
  const { i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  const tr = (en: string, deText: string) => (de ? deText : en);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const manageRecord = useServerFn(adminManageRecord);
  const complete = useServerFn(completeFestivalSale);
  const history = useServerFn(listFestivalSales);
  const [sales, setSales] = useState<FestivalSale[]>([]);
  const [receipt, setReceipt] = useState<FestivalSale | null>(null);
  const [method, setMethod] = useState<"cash" | "card_terminal">("cash");
  const [reference, setReference] = useState("");
  const [received, setReceived] = useState(false);
  const saleAttempt = useRef<{ body: string; id: string } | null>(null);
  const listSaved = useServerFn(listFestivalBaskets);
  const [previous, setPrevious] = useState<Awaited<ReturnType<typeof listSaved>>>([]);
  const lookup = useServerFn(lookupUnit),
    save = useServerFn(saveFestivalBasket);
  const [items, setItems] = useState<TracedUnit[]>([]),
    [code, setCode] = useState(""),
    [event, setEvent] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false);
  useEffect(() => {
    try {
      setEvent(sessionStorage.getItem("kaptan-festival-event") ?? "");
    } catch {
      /* Storage may be disabled. */
    }
    if (expanded) input.current?.focus();
  }, [expanded]);
  const lock = useRef(false),
    input = useRef<HTMLInputElement>(null),
    pending = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => {
    setReceived(false);
  }, [items, event, method, reference]);
  const total = items.reduce((sum, i) => sum + BigInt(i.price), 0n).toString();
  const money = (n: string) =>
    new Intl.NumberFormat(de ? "de-DE" : "en-GB", { style: "currency", currency: "EUR" }).format(
      Number(n) / 100,
    );
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
      input.current?.focus();
    }
  }
  function scan(raw: string) {
    setCamera(false);
    void run(async () => {
      const unit = await lookup({ data: { code: raw } });
      if (unit.state !== "available")
        throw new Error(tr("This unit is not available.", "Dieser Artikel ist nicht verfügbar."));
      if (items.some((i) => i.id === unit.id))
        throw new Error(
          tr(
            "Already in basket — one label is one item.",
            "Bereits im Warenkorb – ein Etikett entspricht einem Artikel.",
          ),
        );
      if (items.length >= 100) throw new Error(tr("Maximum 100 items.", "Maximal 100 Artikel."));
      setItems((old) => [...old, unit]);
      setSaved("");
      setCode("");
    });
  }
  return (
    <section className="mb-6 rounded-2xl border border-primary/30 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">
          {tr("New customer basket", "Neuer Kundenwarenkorb")}
        </h2>
        <button
          type="button"
          className="warehouse-button"
          disabled={busy || !items.length}
          onClick={() => {
            if (
              !saved &&
              !window.confirm(
                tr("Clear this unsaved basket?", "Diesen ungespeicherten Warenkorb leeren?"),
              )
            )
              return;
            setItems([]);
            setCode("");
            setSaved("");
            setError("");
            pending.current = null;
            input.current?.focus();
          }}
        >
          {tr("Next customer", "Nächster Kunde")}
        </button>
      </div>
      <p className="my-3 text-sm text-muted-foreground">
        {tr(
          "You operate this screen for the customer. Scan each product label; names, variants and prices fill in automatically. No customer login needed to prepare a basket.",
          "Sie bedienen diese Ansicht für den Kunden. Produktetiketten scannen; Namen, Varianten und Preise erscheinen automatisch. Für die Vorbereitung ist keine Kundenanmeldung nötig.",
        )}
      </p>
      <p className="my-3 text-sm text-amber-200">
        {tr(
          "Scan items, collect payment in cash or on your card terminal, then confirm payment below. Saving for later does not reserve stock.",
          "Artikel scannen, Bargeld oder Kartenzahlung am Terminal entgegennehmen und unten bestätigen. Speichern reserviert keinen Bestand.",
        )}
      </p>
      <button
        type="button"
        className="warehouse-button mb-3"
        disabled={busy}
        onClick={() => void run(async () => setPrevious(await listSaved()))}
      >
        {tr("My saved baskets", "Meine gespeicherten Warenkörbe")}
      </button>
      {previous.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            className="mb-2 block text-left text-sm text-primary"
            onClick={() =>
              void run(async () => {
                const fresh = await Promise.all(
                  p.snapshot.items.map((i) => lookup({ data: { code: i.unit_number } })),
                );
                if (fresh.some((i) => i.state !== "available"))
                  throw new Error(
                    tr(
                      "Some saved items are no longer available.",
                      "Einige gespeicherte Artikel sind nicht mehr verfügbar.",
                    ),
                  );
                setItems(fresh);
                setEvent(p.event);
                setPrevious([]);
              })
            }
          >
            {p.event} · {new Date(p.created_at).toLocaleString(de ? "de-DE" : "en-GB")}
          </button>
          {isAdmin && (
            <button
              className="text-sm text-red-300 underline"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    tr("Delete this saved basket?", "Diesen gespeicherten Warenkorb löschen?"),
                  )
                )
                  return;
                void run(async () => {
                  await manageRecord({ data: { action: "basket_delete", id: p.id, values: {} } });
                  setPrevious(await listSaved());
                });
              }}
            >
              {tr("Delete", "Löschen")}
            </button>
          )}
        </div>
      ))}
      <label>
        {tr("Festival / stand", "Festival / Stand")}
        <input
          className="warehouse-input w-full"
          maxLength={120}
          disabled={busy}
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            try {
              sessionStorage.setItem("kaptan-festival-event", e.target.value);
            } catch {
              /* Keep the event in memory. */
            }
            setSaved("");
          }}
        />
      </label>
      <form
        className="my-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          scan(code);
        }}
      >
        <input
          ref={input}
          aria-label={tr("Scan item", "Artikel scannen")}
          className="warehouse-input min-w-0 flex-1"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          placeholder={tr("Scan QR or enter unit number", "QR scannen oder Artikelnummer eingeben")}
          autoComplete="off"
          disabled={busy}
        />
        <button className="warehouse-button" disabled={busy}>
          {tr("Add", "Hinzufügen")}
        </button>
        <button
          type="button"
          className="warehouse-button"
          disabled={busy}
          onClick={() => setCamera(!camera)}
        >
          {tr("Camera", "Kamera")}
        </button>
      </form>
      {camera && <QrCamera onScan={scan} onClose={() => setCamera(false)} />}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {!items.length && (
        <div className="rounded-xl border border-dashed border-primary/30 p-8 text-center">
          <p className="text-xl">{tr("Scan the first item", "Ersten Artikel scannen")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr(
              "Use a USB scanner, the camera button, or type the number printed below the QR code.",
              "USB-Scanner oder Kamerataste verwenden oder die Nummer unter dem QR-Code eingeben.",
            )}
          </p>
        </div>
      )}
      {items.map((i) => (
        <div
          key={i.id}
          className="flex items-center justify-between gap-3 border-b border-border py-3"
        >
          <div>
            <b>{i.name}</b>
            <p className="text-sm text-muted-foreground">
              {i.variant} · {i.unit_number}
            </p>
          </div>
          <span>{money(i.price)}</span>
          <button
            disabled={busy}
            aria-label={tr("Remove ", "Entfernen ") + i.unit_number}
            onClick={() => {
              setItems((old) => old.filter((x) => x.id !== i.id));
              setSaved("");
            }}
          >
            ×
          </button>
        </div>
      ))}
      <p className="my-4 text-xl">
        {items.length} {tr("items", "Artikel")} · {tr("Total", "Gesamt")}:{" "}
        {money(items.reduce((sum, i) => sum + BigInt(i.price), 0n).toString())}
      </p>
      <button
        className="warehouse-button"
        disabled={busy || !items.length || !event.trim()}
        onClick={() =>
          void run(async () => {
            const data = { event, units: items.map((i) => i.id) };
            const body = JSON.stringify(data);
            if (pending.current?.body !== body) pending.current = { body, id: crypto.randomUUID() };
            const result = await save({ data: { id: pending.current.id, ...data } });
            setSaved(result.id);
            pending.current = null;
          })
        }
      >
        {tr("Save basket for later", "Warenkorb für später speichern")}
      </button>
      {saved && (
        <p role="status" className="mt-3 break-all text-sm">
          {tr("Saved under your staff account", "Unter Ihrem Mitarbeiterkonto gespeichert")}:{" "}
          {saved}
        </p>
      )}
      {items.length > 0 && (
        <fieldset
          disabled={busy}
          className="mt-6 space-y-4 rounded-xl border border-primary/30 p-5"
        >
          <legend className="px-2 font-serif text-xl">
            {tr("Complete sale", "Verkauf abschließen")}
          </legend>
          <label className="block">
            {tr("Payment method", "Zahlungsart")}
            <select
              className="warehouse-input mt-2 w-full"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="cash">{tr("Cash", "Bargeld")}</option>
              <option value="card_terminal">{tr("Card terminal", "Kartenterminal")}</option>
            </select>
          </label>
          {method === "card_terminal" && (
            <label className="block">
              {tr(
                "Terminal receipt / transaction reference",
                "Terminalbeleg / Transaktionsreferenz",
              )}
              <input
                className="warehouse-input mt-2 w-full"
                value={reference}
                maxLength={120}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          )}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={received}
              onChange={(e) => setReceived(e.target.checked)}
            />
            {tr("I confirm payment received:", "Ich bestätige den Zahlungseingang:")} {money(total)}
          </label>
          <button
            className="warehouse-button w-full"
            disabled={
              !received || !event.trim() || (method === "card_terminal" && !reference.trim())
            }
            onClick={() =>
              void run(async () => {
                const data = {
                  event,
                  units: items.map((i) => i.id),
                  method,
                  reference: method === "cash" ? "" : reference,
                  total,
                  received: true as const,
                };
                const body = JSON.stringify(data);
                // Retain the same request identity for retries, including a refresh.
                const stored = sessionStorage.getItem("kaptan-festival-attempt");
                if (!saleAttempt.current && stored) saleAttempt.current = JSON.parse(stored);
                if (saleAttempt.current?.body !== body)
                  saleAttempt.current = { body, id: crypto.randomUUID() };
                sessionStorage.setItem(
                  "kaptan-festival-attempt",
                  JSON.stringify(saleAttempt.current),
                );
                const result = await complete({ data: { ...data, id: saleAttempt.current.id } });
                setReceipt(result);
                setItems([]);
                setReceived(false);
                setReference("");
                setCode("");
                saleAttempt.current = null;
                sessionStorage.removeItem("kaptan-festival-attempt");
              })
            }
          >
            {busy
              ? tr("Saving…", "Speichern…")
              : tr("Payment received · Complete sale", "Zahlung erhalten · Verkauf abschließen")}
          </button>
          <p className="text-sm text-muted-foreground">
            {tr(
              "Records an external payment and updates stock. This screen does not charge a card or issue a fiscal invoice. If saving fails, keep the basket and retry; do not collect payment again.",
              "Erfasst eine externe Zahlung und aktualisiert den Bestand. Diese Ansicht belastet keine Karte und erstellt keine steuerliche Rechnung. Bei einem Speicherfehler den Warenkorb behalten und erneut versuchen; nicht erneut kassieren.",
            )}
          </p>
        </fieldset>
      )}
      {receipt && (
        <div role="status" className="my-5 rounded-xl border border-green-500/40 p-4">
          <h3 className="text-xl">
            {tr("Sale completed", "Verkauf abgeschlossen")} · {money(receipt.total)}
          </h3>
          <p className="text-sm break-all">{receipt.id}</p>
          <p>
            {tr(
              "Stock updated. Ready for the next customer.",
              "Bestand aktualisiert. Bereit für den nächsten Kunden.",
            )}
          </p>
        </div>
      )}
      <button
        className="warehouse-button mt-5"
        disabled={busy}
        onClick={() => void run(async () => setSales(await history()))}
      >
        {tr("Recent sales", "Letzte Verkäufe")}
      </button>
      {sales.map((sale) => (
        <details key={sale.id} className="border-b border-border py-3">
          <summary>
            {new Date(sale.created_at).toLocaleString(de ? "de-DE" : "en-GB")} · {money(sale.total)}{" "}
            ·{" "}
            {sale.payment_method === "cash"
              ? tr("Cash", "Bargeld")
              : tr("Card terminal", "Kartenterminal")}
          </summary>
          <p>
            {sale.event} · {sale.payment_reference}
          </p>
          {sale.items.map((item) => (
            <p key={item.id}>
              {item.name} · {item.variant} · {item.unit_number} · {money(item.price)}
            </p>
          ))}
        </details>
      ))}
    </section>
  );
}
