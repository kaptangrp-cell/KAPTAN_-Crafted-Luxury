import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  lookupUnit,
  moveUnit,
  listPurchases,
  savePurchase,
  purchaseLabels,
  attachPurchaseDocument,
  type TracedUnit,
} from "@/lib/operations.functions";
import { uploadFinanceDocument } from "@/lib/finance-documents.functions";
import { getWarehouseDashboard } from "@/lib/warehouse.functions";
import { LabelSheet } from "./LabelSheet";
import { QrCamera } from "./QrCamera";
import type { UnitLabel } from "@/lib/warehouse";
import { useAuthStore } from "@/stores/authStore";

export function OperationsDesk({ admin, canMove }: { admin: boolean; canMove: boolean }) {
  const { i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  const tr = (en: string, german: string) => (de ? german : en);
  const user = useAuthStore((s) => s.user);
  const move = useServerFn(moveUnit);
  const lookup = useServerFn(lookupUnit),
    list = useServerFn(listPurchases),
    save = useServerFn(savePurchase),
    labels = useServerFn(purchaseLabels),
    upload = useServerFn(uploadFinanceDocument),
    attach = useServerFn(attachPurchaseDocument),
    dashboard = useServerFn(getWarehouseDashboard);
  const [tab, setTab] = useState<"history" | "purchase">("history");
  const [code, setCode] = useState(""),
    [unit, setUnit] = useState<TracedUnit | null>(null),
    [camera, setCamera] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [supplier, setSupplier] = useState(""),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()),
    );
  const [document, setDocument] = useState(""),
    [filename, setFilename] = useState("");
  const [lines, setLines] = useState([{ variant: "", quantity: 1 }]);
  const pendingPurchase = useRef<{ body: string; id: string } | null>(null);
  const pendingBatch = useRef<{ body: string; id: string } | null>(null);
  const [sheet, setSheet] = useState<UnitLabel[]>([]),
    [location, setLocation] = useState("Main"),
    [counts, setCounts] = useState<Record<string, number>>({});
  const purchases = useQuery({
    queryKey: ["operations-purchases", user?.id],
    queryFn: () => list(),
    enabled: admin && tab === "purchase",
    retry: false,
  });
  const catalog = useQuery({
    queryKey: ["operations-catalog", user?.id],
    queryFn: () => dashboard({ data: { admin: true } }),
    enabled: admin && tab === "purchase",
    retry: false,
  });
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function readFile(file: File) {
    if (file.size > 3 * 1024 * 1024)
      throw new Error(tr("Maximum 3 MB per invoice.", "Maximal 3 MB pro Beleg."));
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(new Error("File read failed"));
      r.readAsDataURL(file);
    });
    return upload({ data: { name: file.name, base64 } });
  }
  function trace(raw: string) {
    setCamera(false);
    void run(async () => {
      setUnit(null);
      setUnit(await lookup({ data: { code: raw } }));
    });
  }
  const input = "warehouse-input w-full";
  return (
    <section className="mb-8 rounded-2xl border border-primary/30 bg-card p-5">
      <h2 className="mb-2 font-serif text-2xl">{tr("Product operations", "Warenverwaltung")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {tr(
          "Purchase → label → receive → trace. Each label belongs to one physical item.",
          "Einkaufen → Etikettieren → Empfangen → Nachverfolgen. Jedes Etikett gehört zu einem einzelnen Artikel.",
        )}
      </p>
      <div className="mb-5 flex gap-3">
        <button
          className="warehouse-button"
          aria-pressed={tab === "history"}
          onClick={() => setTab("history")}
        >
          {tr("Find a product", "Artikel finden")}
        </button>
        {admin && (
          <button
            className="warehouse-button"
            aria-pressed={tab === "purchase"}
            onClick={() => setTab("purchase")}
          >
            {tr("Purchases & labels", "Einkäufe & Etiketten")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="my-3 text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="my-3 text-green-300">
          {message}
        </p>
      )}
      {tab === "history" ? (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              trace(code);
            }}
          >
            <label className="flex-1">
              {tr("Scan QR or enter unit number", "QR scannen oder Artikelnummer eingeben")}
              <input
                className={input}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="KPLWB-123"
                required
                maxLength={100}
              />
            </label>
            <button className="warehouse-button self-end" disabled={busy}>
              {tr("Find", "Suchen")}
            </button>
            <button
              type="button"
              className="warehouse-button self-end"
              onClick={() => setCamera(!camera)}
            >
              {tr("Camera", "Kamera")}
            </button>
          </form>
          {camera && <QrCamera onScan={trace} onClose={() => setCamera(false)} />}
          {unit && (
            <article className="mt-5 space-y-4">
              <div>
                <strong className="font-mono text-xl text-primary">{unit.unit_number}</strong>
                <h3>
                  {unit.name} · {unit.variant}
                </h3>
                <p>
                  {unit.state} · {unit.location}
                </p>
              </div>
              {unit.purchase ? (
                <p>
                  {tr("Purchased", "Eingekauft")}: {unit.purchase.date} · {unit.purchase.supplier} ·{" "}
                  {unit.purchase.reference}
                </p>
              ) : (
                admin && (
                  <p className="text-muted-foreground">
                    {tr(
                      "No purchase linked to this older label.",
                      "Für dieses ältere Etikett ist kein Einkauf verknüpft.",
                    )}
                  </p>
                )
              )}
              {canMove && ["available", "quarantine", "damaged"].includes(unit.state) && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const data = { unit: unit.id, location };
                      const body = JSON.stringify(data);
                      if (pendingBatch.current?.body !== body)
                        pendingBatch.current = { body, id: crypto.randomUUID() };
                      await move({ data: { ...data, operation: pendingBatch.current.id } });
                      pendingBatch.current = null;
                      setUnit(await lookup({ data: { code: unit.unit_number } }));
                    });
                  }}
                >
                  <label className="flex-1">
                    {tr("Move to warehouse / shelf", "In Lager / Regal verschieben")}
                    <input
                      className={input}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      required
                      maxLength={80}
                    />
                  </label>
                  <button className="warehouse-button self-end" disabled={busy}>
                    {tr("Move", "Verschieben")}
                  </button>
                </form>
              )}
              <ol className="space-y-3 border-l border-primary/40 pl-4">
                {unit.events.map((event, index) => (
                  <li key={index}>
                    <b>
                      {event.from ? `${event.from} → ` : ""}
                      {event.to}
                    </b>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.at).toLocaleString(de ? "de-DE" : "en-GB")} · {event.actor}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    {event.reason && <p>{event.reason}</p>}
                    {event.order && (
                      <p className="break-all text-xs">
                        {tr("Order", "Bestellung")}: {event.order}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          )}
        </>
      ) : (
        <>
          {(purchases.error || catalog.error) && (
            <p role="alert">{String(purchases.error || catalog.error)}</p>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const data = { supplier, reference, date, document, lines };
                const body = JSON.stringify(data);
                if (pendingPurchase.current?.body !== body)
                  pendingPurchase.current = { body, id: crypto.randomUUID() };
                await save({ data: { id: pendingPurchase.current.id, ...data } });
                pendingPurchase.current = null;
                setSupplier("");
                setReference("");
                setDocument("");
                setFilename("");
                setLines([{ variant: "", quantity: 1 }]);
                await purchases.refetch();
                setMessage(
                  tr(
                    "Purchase saved. Generate labels when goods arrive, then scan Receive.",
                    "Einkauf gespeichert. Nach Wareneingang Etiketten erstellen und Empfang scannen.",
                  ),
                );
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {tr("Supplier", "Lieferant")}
                <input
                  className={input}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                {tr("Order / invoice reference", "Bestell- / Rechnungsnummer")}
                <input
                  className={input}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                {tr("Order date", "Bestelldatum")}
                <input
                  type="date"
                  className={input}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label>
                {tr(
                  "Upload order or advance invoice",
                  "Bestellung oder Anzahlungsrechnung hochladen",
                )}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xml"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void run(async () => {
                        const doc = await readFile(file);
                        setDocument(doc.id);
                        setFilename(file.name);
                      });
                  }}
                />
                {filename && <span className="block text-sm text-primary">{filename}</span>}
              </label>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="flex gap-2">
                <label className="flex-1">
                  {tr("Product / colour / size", "Produkt / Farbe / Größe")}
                  <select
                    className={input}
                    value={line.variant}
                    required
                    onChange={(e) =>
                      setLines((old) =>
                        old.map((x, i) => (i === index ? { ...x, variant: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="">{tr("Choose product", "Produkt wählen")}</option>
                    {catalog.data?.products?.flatMap((p) =>
                      p.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {p.name} · {v.name}
                        </option>
                      )),
                    )}
                  </select>
                </label>
                <label className="w-24">
                  {tr("Quantity", "Menge")}
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    required
                    className={input}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((old) =>
                        old.map((x, i) =>
                          i === index ? { ...x, quantity: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </label>
                {lines.length > 1 && (
                  <button
                    type="button"
                    aria-label={tr("Remove item", "Artikel entfernen")}
                    onClick={() => setLines((old) => old.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-3">
              <button
                type="button"
                className="warehouse-button"
                disabled={lines.length >= 100}
                onClick={() => setLines((old) => [...old, { variant: "", quantity: 1 }])}
              >
                {tr("+ Add item", "+ Artikel")}
              </button>
              <button className="warehouse-button" disabled={busy || !document}>
                {tr("Save purchase", "Einkauf speichern")}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {tr(
                "Uploading preserves evidence; it does not mark an advance as paid or book an expense. Payments and landed costs are reviewed in Finance.",
                "Der Upload archiviert den Beleg. Anzahlungen werden dadurch nicht als bezahlt oder als Aufwand gebucht. Zahlungen und Einstandskosten werden in Finanzen geprüft.",
              )}
            </p>
          </form>
          <hr className="my-6 border-primary/20" />
          <label>
            {tr("Warehouse / shelf for new labels", "Lager / Regal für neue Etiketten")}
            <input
              className={input}
              maxLength={80}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          {purchases.data?.purchases.map((p) => (
            <article key={p.id} className="my-4 rounded-xl border border-border p-4">
              <h3 className="font-bold">
                {p.reference} · {p.supplier}
              </h3>
              <p className="text-sm text-muted-foreground">{p.ordered_on}</p>
              {p.lines.map((l) => (
                <div key={l.id} className="my-3 space-y-2">
                  <p>
                    {l.name} · {l.variant}
                  </p>
                  <p className="text-sm">
                    {tr("Ordered / labelled / received", "Bestellt / etikettiert / empfangen")}:{" "}
                    {l.quantity} / {l.labelled} / {l.received}
                  </p>
                  {l.labelled < l.quantity && (
                    <div className="flex gap-2">
                      <input
                        aria-label={tr("Number of labels", "Etikettenanzahl")}
                        type="number"
                        className="warehouse-input w-24"
                        min={1}
                        max={Math.min(200, l.quantity - l.labelled)}
                        value={counts[l.id] ?? Math.min(200, l.quantity - l.labelled)}
                        onChange={(e) =>
                          setCounts((old) => ({ ...old, [l.id]: Number(e.target.value) }))
                        }
                      />
                      <button
                        disabled={busy}
                        className="warehouse-button"
                        onClick={() =>
                          void run(async () => {
                            const data = {
                              line: l.id,
                              quantity: counts[l.id] ?? Math.min(200, l.quantity - l.labelled),
                              location,
                            };
                            const body = JSON.stringify(data);
                            if (pendingBatch.current?.body !== body)
                              pendingBatch.current = { body, id: crypto.randomUUID() };
                            setSheet(
                              await labels({
                                data: { ...data, operation: pendingBatch.current.id },
                              }),
                            );
                            pendingBatch.current = null;
                            await purchases.refetch();
                          })
                        }
                      >
                        {tr("Create unit labels", "Einzeletiketten erstellen")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <label className="block text-sm">
                {tr("Attach payment evidence", "Zahlungsbeleg anhängen")}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xml"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void run(async () => {
                        const doc = await readFile(file);
                        await attach({
                          data: {
                            id: crypto.randomUUID(),
                            purchase: p.id,
                            document: doc.id,
                            kind: "payment",
                          },
                        });
                        await purchases.refetch();
                      });
                  }}
                />
              </label>
              {p.documents.map((d) => (
                <p key={d.id} className="text-sm text-muted-foreground">
                  {d.filename}
                </p>
              ))}
            </article>
          ))}
          <LabelSheet labels={sheet} />
        </>
      )}
    </section>
  );
}
