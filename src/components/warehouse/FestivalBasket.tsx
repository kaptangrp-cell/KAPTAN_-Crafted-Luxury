import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  lookupUnit,
  listFestivalBaskets,
  saveFestivalBasket,
  type TracedUnit,
} from "@/lib/operations.functions";
import { QrCamera } from "./QrCamera";
export function FestivalBasket({ expanded = false }: { expanded?: boolean }) {
  const { i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  const tr = (en: string, deText: string) => (de ? deText : en);
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
    if (!busy && expanded) input.current?.focus();
  }, [busy, expanded]);
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
          "Preparation only: saving a basket does not sell, reserve stock, take payment or issue an invoice. Checkout awaits the payment / fiscal receipt setup.",
          "Nur Vorbereitung: Speichern verkauft oder reserviert keine Ware, nimmt keine Zahlung an und erstellt keine Rechnung. Der Kassenabschluss benötigt die Zahlungs- und Beleganbindung.",
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
        <button
          type="button"
          key={p.id}
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
      ))}
      <label>
        {tr("Festival / stand", "Festival / Stand")}
        <input
          className="warehouse-input w-full"
          maxLength={120}
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
        <button type="button" className="warehouse-button" onClick={() => setCamera(!camera)}>
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
      <div className="mt-6 rounded-xl border border-amber-500/30 p-4 text-sm">
        <h3 className="font-semibold">
          {tr("Payment checkout is not available yet", "Zahlungsabschluss noch nicht verfügbar")}
        </h3>
        <p className="mt-2 text-muted-foreground">
          {tr(
            "Cash, PayPal and Revolut checkout, optional customer accounts, receipts and automatic Finance posting still need integration. Saving here does not complete a sale.",
            "Bargeld-, PayPal- und Revolut-Abschluss, optionale Kundenkonten, Belege und automatische Finanzbuchungen müssen noch angebunden werden. Speichern schließt keinen Verkauf ab.",
          )}
        </p>
      </div>
    </section>
  );
}
