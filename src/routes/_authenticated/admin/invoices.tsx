import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { FileText, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listInvoices,
  invoiceProducts,
  invoiceAction,
  downloadInvoice,
  type InvoiceRow,
} from "@/lib/invoices.functions";
import { invoiceRange, csvCell, type InvoicePeriod } from "@/lib/invoices/reporting";
import { berlinDate, money } from "@/lib/invoices/model";
export const Route = createFileRoute("/_authenticated/admin/invoices")({ component: InvoicesPage });
function save(name: string, bytes: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function InvoicesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listInvoices),
    productsFn = useServerFn(invoiceProducts),
    action = useServerFn(invoiceAction),
    download = useServerFn(downloadInvoice);
  const [period, setPeriod] = useState<InvoicePeriod>("all"),
    [anchor, setAnchor] = useState(berlinDate()),
    [productId, setProduct] = useState(""),
    [kind, setKind] = useState<"" | "advance" | "final" | "credit">(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{
      row: InvoiceRow;
      action: "final" | "credit" | "portal_submitted";
    } | null>(null),
    [detail, setDetail] = useState("");
  const range = invoiceRange(period, anchor || berlinDate());
  const filter = {
    from: range.from || undefined,
    to: range.to || undefined,
    productId: productId || undefined,
    kind: kind || undefined,
    page,
  };
  const query = useQuery({
    queryKey: ["invoices", filter],
    queryFn: () => list({ data: filter }),
    refetchInterval: 30000,
  });
  const products = useQuery({ queryKey: ["invoice-products"], queryFn: () => productsFn() });
  async function run(
    id: string,
    verb: "retry" | "final" | "credit" | "portal_submitted",
    details = {},
  ) {
    setBusy(true);
    try {
      await action({ data: { id, action: verb, details } });
      toast.success(t("invoices.saved"));
      setDialog(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function file(id: string, format: "pdf" | "xml" | "validation") {
    setBusy(true);
    try {
      const result = await download({ data: { id, format } });
      save(
        result.name,
        Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0)),
        result.mime,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    setBusy(true);
    try {
      const rows: InvoiceRow[] = [];
      for (let p = 0; ; p++) {
        const batch = await list({ data: { ...filter, page: p } });
        rows.push(...batch.rows);
        if (rows.length >= batch.count) break;
      }
      const headers = [
        "Invoice",
        "Order",
        "Kind",
        "Issue date",
        "State",
        "Buyer",
        "Net EUR",
        "VAT EUR",
        "Gross EUR",
        "Rounding EUR",
        "Payment EUR",
        "Due EUR",
        "Reference",
        "Product IDs",
        "Matching product net EUR",
      ];
      const csv = [
        headers.map(csvCell).join(";"),
        ...rows.map((r) =>
          [
            r.number,
            r.model?.orderNumber,
            r.kind,
            r.issue_date,
            r.state,
            r.model?.buyer.legalName,
            r.model ? money(r.model.net) : "",
            r.model ? money(r.model.vat) : "",
            r.model ? money(r.model.gross) : "",
            r.model ? money(r.model.rounding) : "",
            r.model ? money(r.model.paid) : "",
            r.model ? money(r.model.due) : "",
            r.model?.reference?.number,
            r.model?.lines
              .map((l) => l.productId)
              .filter(Boolean)
              .join("|"),
            r.model
              ? money(
                  r.model.lines
                    .filter((l) => l.productId && (!productId || l.productId === productId))
                    .reduce((s, l) => s + l.net, 0),
                )
              : "",
          ]
            .map(csvCell)
            .join(";"),
        ),
      ].join("\r\n");
      save("kaptan-invoices.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">KAPTAN / Finance</p>
          <h1 className="mt-2 font-serif text-3xl">{t("invoices.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/60">{t("invoices.intro")}</p>
        </div>
        <button
          className="flex items-center gap-2 rounded-xl border border-gold/30 px-4 py-3 text-gold disabled:opacity-50"
          disabled={busy || query.isError}
          onClick={() => void exportCsv()}
        >
          <Download size={16} />
          {t("invoices.export")}
        </button>
      </header>
      <div className="grid gap-4 rounded-2xl border border-gold/20 bg-[#0D0D0D] p-5 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">
          {t("invoices.period")}
          <select
            className="warehouse-input mt-2"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as InvoicePeriod);
              setPage(0);
            }}
          >
            {(["all", "day", "week", "month", "year"] as const).map((p) => (
              <option key={p} value={p}>
                {t("invoices." + p)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("invoices.date")}
          <input
            type="date"
            className="warehouse-input mt-2"
            value={anchor}
            onChange={(e) => {
              setAnchor(e.target.value);
              setPage(0);
            }}
            disabled={period === "all"}
          />
        </label>
        <label className="text-sm">
          {t("invoices.product")}
          <select
            className="warehouse-input mt-2"
            value={productId}
            onChange={(e) => {
              setProduct(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("invoices.all")}</option>
            {products.data?.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("invoices.type")}
          <select
            className="warehouse-input mt-2"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setPage(0);
            }}
          >
            {["", "advance", "final", "credit"].map((k) => (
              <option value={k} key={k}>
                {t("invoices." + (k || "all"))}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="rounded-xl border border-gold/10 p-4 text-xs leading-relaxed text-white/60">
        {t("invoices.reportingNote")}
      </p>
      {query.isError ? (
        <div role="alert" className="rounded-xl border border-red-400/30 p-5">
          {(query.error as Error).message}
          <button className="ml-3 text-gold" onClick={() => void query.refetch()}>
            {t("invoices.retry")}
          </button>
        </div>
      ) : query.isLoading ? (
        <p>{t("invoices.loading")}</p>
      ) : !query.data?.rows.length ? (
        <div className="rounded-2xl border border-gold/15 p-12 text-center">
          <FileText className="mx-auto text-gold" />
          <p className="mt-4">{t("invoices.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {query.data.rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-gold/15 bg-[#0D0D0D] p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-mono text-gold">{row.number}</p>
                  <p className="mt-1 text-sm text-white/60">
                    {t("invoices." + row.kind)} · {row.issue_date || "—"} ·{" "}
                    {t("invoices." + row.state)}
                  </p>
                  <Link to="/admin/orders" className="mt-2 block text-sm underline">
                    {row.model?.orderNumber || row.order_id}
                  </Link>
                  <p className="mt-2">{row.model?.buyer.legalName}</p>
                </div>
                {row.model && (
                  <dl className="text-right text-sm">
                    <dt>
                      {t("invoices.net")} / {t("invoices.vat")}
                    </dt>
                    <dd>
                      {money(row.model.net)} € / {money(row.model.vat)} €
                    </dd>
                    <dt className="mt-2 text-white/60">{t("invoices.gross")}</dt>
                    <dd className="text-xl text-gold">
                      {money(row.model.gross + row.model.rounding)} €
                    </dd>
                  </dl>
                )}
              </div>
              {row.error && (
                <p role="alert" className="mt-3 text-sm text-red-300">
                  {row.error}
                </p>
              )}
              {row.invoice_delivery && (
                <p className="mt-3 text-xs text-white/60">
                  Email: {t("invoices." + row.invoice_delivery.state)} {row.invoice_delivery.error}
                </p>
              )}
              {row.model?.buyer.deliveryChannel === "portal" && (
                <div className="mt-3 rounded-lg border border-amber-400/30 p-3 text-sm text-amber-200">
                  <p>
                    {row.invoice_delivery?.portal_submitted_at
                      ? t("invoices.portalDone")
                      : t("invoices.portalPending")}
                  </p>
                  <p className="mt-1 break-words">{row.model.buyer.portalInstructions}</p>
                  <p>{row.invoice_delivery?.portal_reference}</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-gold">
                {row.state === "issued" &&
                  (["pdf", "xml"] as const).map((f) => (
                    <button
                      key={f}
                      disabled={busy}
                      onClick={() => void file(row.id, f)}
                      className="rounded-lg border border-gold/20 px-3 py-2"
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                <button disabled={busy} onClick={() => void file(row.id, "validation")}>
                  {t("invoices.validation")}
                </button>
                {(row.state === "error" || row.invoice_delivery?.state === "error") && (
                  <button
                    disabled={busy}
                    onClick={() => void run(row.id, "retry")}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    {t("invoices.retry")}
                  </button>
                )}
                {row.state === "issued" && row.kind !== "credit" && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setDialog({ row, action: "credit" });
                        setDetail("");
                      }}
                    >
                      {t("invoices.correct")}
                    </button>
                    {row.kind === "advance" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setDialog({ row, action: "final" });
                          setDetail("");
                        }}
                      >
                        {t("invoices.createFinal")}
                      </button>
                    )}
                  </>
                )}
                {row.state === "issued" &&
                  row.model?.buyer.deliveryChannel === "portal" &&
                  !row.invoice_delivery?.portal_submitted_at && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setDialog({ row, action: "portal_submitted" });
                        setDetail("");
                      }}
                    >
                      {t("invoices.portalRecord")}
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t("invoices.previous")}
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil((query.data?.count ?? 0) / 50))}
        </span>
        <button
          disabled={(page + 1) * 50 >= (query.data?.count ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("invoices.next")}
        </button>
      </div>
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-dialog-title"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                dialog.row.id,
                dialog.action,
                dialog.action === "final"
                  ? { supplyDate: detail }
                  : dialog.action === "credit"
                    ? { reason: detail }
                    : { reference: detail },
              );
            }}
            className="w-full max-w-lg rounded-2xl border border-gold/30 bg-[#111] p-6"
          >
            <h2 id="invoice-dialog-title" className="font-serif text-xl">
              {t(
                "invoices." +
                  (dialog.action === "final"
                    ? "createFinal"
                    : dialog.action === "credit"
                      ? "correct"
                      : "portalRecord"),
              )}
            </h2>
            <p className="mt-3 text-sm text-white/60">
              {dialog.action === "credit"
                ? t("invoices.correctionNote")
                : t("invoices." + (dialog.action === "final" ? "supplyHelp" : "portalHelp"))}
            </p>
            <label className="mt-4 block text-sm">
              {t(
                "invoices." +
                  (dialog.action === "final"
                    ? "supplyDate"
                    : dialog.action === "credit"
                      ? "reason"
                      : "receipt"),
              )}
              <input
                autoFocus
                required
                minLength={dialog.action === "credit" ? 5 : undefined}
                maxLength={500}
                type={dialog.action === "final" ? "date" : "text"}
                max={dialog.action === "final" ? berlinDate() : undefined}
                className="warehouse-input mt-2"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
            </label>
            <div className="mt-6 flex justify-end gap-4">
              <button type="button" onClick={() => setDialog(null)}>
                {t("invoices.cancel")}
              </button>
              <button disabled={busy} className="rounded-lg bg-gold px-5 py-2 text-black">
                {t("invoices.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
