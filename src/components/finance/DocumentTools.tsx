import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  financeDocumentDetails,
  financeExtractInvoice,
  financeValidationRetry,
} from "@/lib/finance-extraction.functions";
import { financeAdministrationSave } from "@/lib/finance-administration.functions";
import type { Extraction } from "@/lib/finance/extraction";
import { euros } from "@/lib/finance/money";
const field = "w-full rounded border border-white/20 bg-neutral-950 p-2 text-white";
export function DocumentTools({
  id,
  mime,
  role,
  apply,
}: {
  id: string;
  mime: string;
  role: string;
  apply: (e: Extraction) => void;
}) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient(),
    read = useServerFn(financeDocumentDetails),
    extract = useServerFn(financeExtractInvoice),
    retryValidation = useServerFn(financeValidationRetry),
    save = useServerFn(financeAdministrationSave),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["finance-document-tools", user, id],
    queryFn: () => read({ data: { id } }),
    enabled: !!user,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.extractions.some((e) =>
        ["queued", "processing"].includes(e.validation?.state ?? ""),
      )
        ? 15000
        : false,
  });
  const [recordClass, setRecordClass] = useState<
      "unclassified" | "accounting_book" | "accounting_voucher" | "correspondence"
    >("unclassified"),
    [until, setUntil] = useState(""),
    [hold, setHold] = useState(true),
    [reason, setReason] = useState("");
  const entry = q.data?.extractions[0];
  const latest = entry?.result;
  const validation = entry?.validation;
  return (
    <div className="space-y-3 rounded-xl border border-white/20 p-4">
      {q.error && <p role="alert">{q.error.message}</p>}
      {role !== "auditor" && ["application/xml", "application/pdf"].includes(mime) && (
        <button
          className="text-yellow-300 underline disabled:opacity-40"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await extract({ data: { id } });
              await qc.invalidateQueries({ queryKey: ["finance-document-tools", user, id] });
            } catch (e) {
              toast.error(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {say("Strukturierte Rechnungsdaten auslesen", "Extract structured invoice data")}
        </button>
      )}
      {latest && (
        <div className="space-y-2">
          <p>
            {latest.format} · {latest.kind} · {latest.number} · {latest.date}
          </p>
          <p>
            {latest.supplier} · {latest.supplierCountry} · {latest.supplierTaxId}
          </p>
          <p>
            {latest.gross !== null && latest.currency === "EUR"
              ? euros(latest.gross, de)
              : `${latest.gross ?? "—"} minor units ${latest.currency ?? "—"}`}
          </p>
          <p className="text-amber-200">
            {say(
              "Die Extraktion ersetzt keine Validierung. Original und Steuerfall prüfen.",
              "Extraction does not replace validation. Review original and tax treatment.",
            )}
          </p>
          {latest.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-200">
              {w}
            </p>
          ))}
          {role !== "auditor" &&
            latest.kind === "invoice" &&
            latest.currency === "EUR" &&
            latest.supplierCountry === "DE" &&
            latest.arithmetic === "consistent" && (
              <button className="text-yellow-300 underline" onClick={() => apply(latest)}>
                {say("Als ungeprüften Vorschlag übernehmen", "Use as unverified suggestion")}
              </button>
            )}
        </div>
      )}
      {validation && (
        <section className="space-y-2 border-t border-white/20 pt-3" aria-live="polite">
          <h4>{say("XRechnung-Prüfung", "XRechnung validation")}</h4>
          <p>
            {validation.state === "finished"
              ? validation.accepted
                ? say(
                    "Vom konfigurierten Validator akzeptiert",
                    "Accepted by the configured validator",
                  )
                : say(
                    "Vom konfigurierten Validator abgelehnt",
                    "Rejected by the configured validator",
                  )
              : validation.state === "error"
                ? say("Technischer Prüffehler", "Validation infrastructure error")
                : validation.state === "processing"
                  ? say("Prüfung läuft", "Validation in progress")
                  : say(
                      "Wartet auf den lokalen Prüf-Worker",
                      "Waiting for the local validation worker",
                    )}
          </p>
          <p className="text-sm text-neutral-400">
            {validation.engine} · {validation.configuration}
          </p>
          <p className="text-sm">
            {say(
              "Die Prüfung gilt für die angegebene Konfiguration. Sie bestätigt weder die steuerliche Behandlung noch PDF/A-Konformität.",
              "Validation applies to the named configuration. It does not confirm tax treatment or PDF/A conformance.",
            )}
          </p>
          {validation.error && <p role="alert">{validation.error}</p>}
          {validation.report && (
            <details>
              <summary>{say("Prüfbericht anzeigen", "View validation report")}</summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                {validation.report}
              </pre>
            </details>
          )}
          {validation.state === "error" && role !== "auditor" && entry && (
            <button
              className="text-yellow-300 underline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await retryValidation({ data: { id: entry.id } });
                  await qc.invalidateQueries({ queryKey: ["finance-document-tools", user, id] });
                } catch (e) {
                  toast.error(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {say("Technische Prüfung erneut versuchen", "Retry validation")}
            </button>
          )}
        </section>
      )}
      <details>
        <summary className="cursor-pointer">
          {say("Aufbewahrung & Sperrvermerk", "Retention & legal hold")}
        </summary>
        <p className="mt-3 text-sm text-neutral-400">
          {say(
            "Keine automatische Löschung. Fristen, Beginn und Verlängerungen müssen anhand der Belegart und Rechtslage geprüft werden. Ohne Festlegung gilt eine vorsorgliche Sperre.",
            "No automatic deletion. Review the period, start and extensions for this record type and legal context. Unclassified records default to a hold.",
          )}
        </p>
        {q.data?.retention && (
          <p>
            {q.data.retention.record_class} · {q.data.retention.retain_until} ·{" "}
            {q.data.retention.legal_hold
              ? say("Sperre aktiv", "Hold active")
              : say("Keine Sperre", "No hold")}
          </p>
        )}
        {["owner", "accountant"].includes(role) && (
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await save({
                  data: {
                    action: "retention",
                    document: id,
                    revision: q.data?.retention?.revision ?? 0,
                    recordClass,
                    until,
                    hold,
                    reason,
                  },
                });
                await qc.invalidateQueries({ queryKey: ["finance-document-tools", user, id] });
                setReason("");
              } catch (err) {
                toast.error(String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              {say("Dokumentklasse", "Record class")}
              <select
                className={field}
                value={recordClass}
                onChange={(e) => setRecordClass(e.target.value as typeof recordClass)}
              >
                {[
                  ["unclassified", "Ungeklärt", "Unclassified"],
                  ["accounting_book", "Buch / Aufzeichnung", "Accounting book"],
                  ["accounting_voucher", "Buchungsbeleg", "Accounting voucher"],
                  ["correspondence", "Geschäftsbrief", "Correspondence"],
                ].map(([v, g, en]) => (
                  <option key={v} value={v}>
                    {say(g, en)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              {say("Mindestens aufbewahren bis", "Retain at least until")}
              <input
                className={field}
                type="date"
                required
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
            <label className="flex gap-3">
              <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
              {say("Löschsperre / Prüfungsbedarf", "Legal hold / review needed")}
            </label>
            <label className="block">
              {say("Geprüfte Grundlage und Begründung", "Reviewed basis and reason")}
              <textarea
                className={field}
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="text-yellow-300 underline" disabled={busy}>
              {say("Festlegung speichern", "Save reviewed decision")}
            </button>
          </form>
        )}
      </details>
    </div>
  );
}
