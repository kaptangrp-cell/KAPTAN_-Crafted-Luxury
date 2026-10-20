import { financeAdministration } from "@/lib/finance-administration.functions";
import { DocumentTools } from "./DocumentTools";
import type { InvoiceHints } from "@/lib/finance/invoice-hints";
import { financeExtractInvoice } from "@/lib/finance-extraction.functions";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  listFinanceDocuments,
  uploadFinanceDocument,
  readFinanceDocument,
  financeExpenseCommand,
  type FinanceDocument,
  type FinanceExpense,
  type ExpenseCommand,
} from "@/lib/finance-documents.functions";
import { cents, euros } from "@/lib/finance/money";
const field = "mt-1 w-full rounded-lg border border-white/20 bg-neutral-950 p-3 text-white";
const button = "rounded-lg bg-[#FFD700] px-4 py-2 font-semibold text-black disabled:opacity-40";
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
type CashAccount = {
  code: string;
  name_de: string;
  name_en: string;
  cash_kind?: "bank" | "cash" | null;
};
export function FinanceDocuments({
  role,
  accounts,
}: {
  accounts: CashAccount[];
  role: "owner" | "accountant" | "staff" | "auditor";
}) {
  const { t, i18n } = useTranslation(),
    de = i18n.language.startsWith("de");
  const user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient();
  const [suggestion, setSuggestion] = useState<{
    document: string;
    value: InvoiceHints;
    nonce: string;
  } | null>(null);
  const list = useServerFn(listFinanceDocuments),
    upload = useServerFn(uploadFinanceDocument),
    read = useServerFn(readFinanceDocument),
    command = useServerFn(financeExpenseCommand);
  const extract = useServerFn(financeExtractInvoice);
  const [reading, setReading] = useState(false);
  const [readingNote, setReadingNote] = useState("");
  async function readInvoice(id: string) {
    setReading(true);
    setReadingNote(t("financeDocs.reading"));
    try {
      const original = await read({data:{id}});
      if (["application/pdf", "application/xml"].includes(original.document.mime)) {
        try {
          const {result} = await extract({data:{id}});
          if (result.kind !== "invoice" || result.currency !== "EUR" || result.arithmetic !== "consistent") {
            setReadingNote(t("financeDocs.specialReview"));
            return;
          }
          setSuggestion({document:id,value:result,nonce:crypto.randomUUID()});
          setReadingNote(t("financeDocs.readReady"));
          return;
        } catch (error) {
          if (original.document.mime === "application/xml") throw error;
        }
      }
      const {readInvoiceLocally} = await import("@/lib/finance/read-invoice.client");
      const result = await readInvoiceLocally(original.base64, original.document.mime);
      setSuggestion({document:id,value:result.hints,nonce:crypto.randomUUID()});
      setReadingNote(t("financeDocs.readReady"));
    } catch {
      setReadingNote(t("financeDocs.readFallback"));
    } finally {setReading(false);}
  }
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null),
    [review, setReview] = useState<FinanceExpense | null>(null),
    [payment, setPayment] = useState<FinanceExpense | null>(null);
  const query = useQuery({
    queryKey: ["finance-documents", user, search, page],
    queryFn: () => list({ data: { search, page } }),
    enabled: !!user,
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["finance-original", user, selected],
    queryFn: () => read({ data: { id: selected! } }),
    enabled: !!user && !!selected,
    retry: false,
    gcTime: 0,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!preview.data) {
      setUrl(null);
      return;
    }
    const bytes = Uint8Array.from(atob(preview.data.base64), (c) => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: preview.data.document.mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [preview.data]);
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["finance-documents"] }),
      qc.invalidateQueries({ queryKey: ["finance"] }),
    ]);
  }
  async function files(files: FileList | File[]) {
    if (busy) return;
    setBusy(true);
    setProgress([]);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        if (file.size > 3 * 1024 * 1024) throw new Error(t("financeDocs.fileLimit"));
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error(t("financeDocs.readFailed")));
          reader.readAsDataURL(file);
        });
        const result = await upload({ data: { name: file.name, base64 } });
        if (!result.duplicate && !file.name.toLowerCase().endsWith('.csv')) uploaded.push(result.id);
        setProgress((p) => [
          ...p,
          `${file.name}: ${t(result.duplicate ? "financeDocs.duplicate" : "financeDocs.uploaded")}`,
        ]);
      } catch (e) {
        setProgress((p) => [...p, `${file.name}: ${e instanceof Error ? e.message : String(e)}`]);
      }
    }
    await refresh();
    setBusy(false);
    if (uploaded.length) {
      setSelected(uploaded[0]); setReview(null); setPayment(null);
      await readInvoice(uploaded[0]);
    }
  }
  async function act(data: ExpenseCommand) {
    setBusy(true);
    try {
      await command({ data });
      await refresh();
      toast.success(t("finance.saved"));
      return true;
    } catch (e) {
      await refresh();
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const canPost = role === "owner" || role === "accountant";
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl">{t("financeDocs.title")}</h2>
        <p className="mt-2 max-w-3xl text-neutral-400">{t("financeDocs.scope")}</p>
      </div>
      {role !== "auditor" && (
        <div
          className="rounded-xl border-2 border-dashed border-yellow-400/40 p-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void files(e.dataTransfer.files);
          }}
        >
          <label className="block font-semibold">
            {t("financeDocs.drop")}
            <input
              className="mt-4 block w-full text-sm"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.xml,.csv"
              disabled={busy || reading}
              onChange={(e) => {
                if (e.target.files) void files(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <p className="mt-2 text-sm text-neutral-400">{t("financeDocs.fileLimit")}</p>
          <div role="status" className="mt-3 space-y-1 text-sm">
            {busy && <p>{t("finance.loading")}</p>}
            {progress.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      )}
      <label className="block max-w-lg">
        {t("financeDocs.search")}
        <input
          className={field}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">{t("finance.loading")}</p>}
      <div className="space-y-6">
        <details open={!selected && !payment}>
          <summary className="cursor-pointer text-lg">{t("financeDocs.originals")}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {query.data?.documents.map((d) => (
              <button
                key={d.id}
                className={`block w-full rounded-xl border p-4 text-left ${selected === d.id ? "border-yellow-400" : "border-white/20"}`}
                disabled={d.state !== "ready" || busy}
                onClick={() => {
                  setSelected(d.id);
                  setReview(null);
                  setPayment(null);
                }}
              >
                <span className="block break-all">{d.filename}</span>
                <span className="text-sm text-neutral-400">
                  {d.created_at.slice(0, 10)} ·{" "}
                  {d.state === "ready" ? t("financeDocs.preserved") : t("financeDocs.retryUpload")}
                </span>
                <span className="mt-2 block text-sm text-yellow-200">{t("financeDocs.openToRecord")}</span>
              </button>
            ))}
            {query.data?.documents.length === 0 && (
              <p className="text-neutral-400">{t("financeDocs.noDocuments")}</p>
            )}
          </div>
        </details>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {preview.error && <p role="alert">{preview.error.message}</p>}
          {preview.isFetching && <p role="status">{t("finance.loading")}</p>}
          {preview.data && url && (
            <>
              <div className="min-w-0 space-y-4">
                {role !== "auditor" && <div className="rounded-xl border border-yellow-400/30 p-4">
                  <button className={button} disabled={busy || reading} onClick={() => void readInvoice(preview.data.document.id)}>{t("financeDocs.readInvoice")}</button>
                  <p role="status" className="mt-2 text-sm text-neutral-300">{readingNote || t("financeDocs.localRead")}</p>
                </div>}
                <div className="flex items-center justify-between gap-3">
                  <h3 className="break-all">{preview.data.document.filename}</h3>
                  <a
                    className="text-yellow-300 underline"
                    href={url}
                    download={preview.data.document.filename}
                  >
                    {t("financeDocs.download")}
                  </a>
                </div>
                {preview.data.document.mime === "application/pdf" ? (
                  <iframe
                    title={t("financeDocs.originalPreview")}
                    src={url}
                    sandbox=""
                    className="h-[480px] w-full rounded-lg bg-white"
                  />
                ) : preview.data.document.mime.startsWith("image/") ? (
                  <img
                    src={url}
                    alt={t("financeDocs.originalPreview")}
                    className="max-h-[480px] w-full rounded-lg object-contain"
                  />
                ) : (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-900 p-4 text-xs">
                    {new TextDecoder().decode(
                      Uint8Array.from(atob(preview.data.base64), (c) => c.charCodeAt(0)),
                    )}
                  </pre>
                )}
                <DocumentTools
                  key={preview.data.document.id}
                  id={preview.data.document.id}
                  mime={preview.data.document.mime}
                  role={role}
                  apply={(value) => {
                    setReview(null);
                    setSuggestion({
                      document: preview.data.document.id,
                      value,
                      nonce: crypto.randomUUID(),
                    });
                  }}
                />
                <p className="break-all text-xs text-neutral-500">
                  SHA-256: {preview.data.document.sha256}
                </p>
              </div>
              {role !== "auditor" && !payment && (
                <ExpenseForm
                  key={
                    review?.id ??
                    (suggestion?.document === preview.data.document.id
                      ? suggestion.nonce
                      : preview.data.document.id)
                  }
                  suggestion={
                    suggestion?.document === preview.data.document.id ? suggestion.value : null
                  }
                  document={preview.data.document}
                  previous={query.data?.expenses.find((e) => e.id === review?.id) ?? review}
                  canPost={canPost}
                  busy={busy || reading}
                  submit={act}
                />
              )}
            </>
          )}
          {payment && (
            <PaymentForm
              accounts={accounts}
              key={payment.id}
              expense={payment}
              documents={query.data?.documents.filter((d) => d.state === "ready") ?? []}
              busy={busy}
              submit={async (d) => {
                const ok = await act(d);
                if (ok) setPayment(null);
                return ok;
              }}
            />
          )}
        </div>
      </div>
      <h3 className="text-xl">{t("financeDocs.expenses")}</h3>
      <div className="space-y-3">
        {query.data?.expenses.map((e) => (
          <article className="rounded-xl border border-white/20 p-4" key={e.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h4>
                  {e.supplier} · {e.invoice_number}
                </h4>
                <p className="text-sm text-neutral-400">
                  {e.invoice_date} · {e.description}
                </p>
              </div>
              <div className="text-right">
                <p>{euros(e.gross, de)}</p>
                <p className="text-sm text-neutral-400">
                  {e.reversed
                    ? t("financeDocs.reversed")
                    : e.superseded
                      ? t("financeDocs.superseded")
                      : e.journal_id
                        ? t("finance.posted")
                        : t("finance.draft")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <button
                className="underline"
                disabled={busy}
                onClick={() => {
                  setSelected(e.document_id);
                  setReview(e);
                  setPayment(null);
                }}
              >
                {t("financeDocs.review")}
              </button>
              {canPost && !e.journal_id && !e.superseded && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    setSelected(e.document_id);
                    setReview(e);
                    setPayment(null);
                  }}
                >
                  {t("financeDocs.reviewToPost")}
                </button>
              )}
              {canPost && e.journal_id && !e.reversed && (
                <>
                  <span>
                    {t("financeDocs.outstanding")}:{" "}
                    {euros((BigInt(e.gross) - BigInt(e.paid)).toString(), de)}
                  </span>
                  {BigInt(e.paid) < BigInt(e.gross) && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => {
                        setPayment(e);
                        setSelected(null);
                        setReview(null);
                      }}
                    >
                      {t("financeDocs.recordPayment")}
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <button
          disabled={page === 0 || busy}
          className="disabled:opacity-30"
          onClick={() => setPage((p) => p - 1)}
        >
          {t("financeDocs.previous")}
        </button>
        <span>{page + 1}</span>
        <button
          disabled={
            busy ||
            !query.data ||
            (query.data.documents.length < 30 && query.data.expenses.length < 30)
          }
          className="disabled:opacity-30"
          onClick={() => setPage((p) => p + 1)}
        >
          {t("financeDocs.next")}
        </button>
      </div>
    </section>
  );
}
function ExpenseForm({
  suggestion,
  canPost,
  document,
  previous,
  busy,
  submit,
}: {
  suggestion: InvoiceHints | null;
  canPost: boolean;
  document: FinanceDocument;
  previous: FinanceExpense | null;
  busy: boolean;
  submit: (data: ExpenseCommand) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const readSuppliers = useServerFn(financeAdministration);
  const userId = useAuthStore((s) => s.user?.id);
  const suppliers = useQuery({
    queryKey: ["finance-supplier-options", userId],
    queryFn: () => readSuppliers({ data: { search: "" } }),
    enabled: !!userId,
  });
  const [id, setId] = useState(() => crypto.randomUUID());
  const [supplier, setSupplier] = useState(previous?.supplier ?? suggestion?.supplier ?? ""),
    [number, setNumber] = useState(previous?.invoice_number ?? suggestion?.number ?? ""),
    [date, setDate] = useState(previous?.invoice_date ?? suggestion?.date ?? ""),
    [description, setDescription] = useState(previous?.description ?? document.filename.replace(/\.[^.]+$/, "")),
    [gross, setGross] = useState(
      previous
        ? `${BigInt(previous.gross) / 100n}.${(BigInt(previous.gross) % 100n).toString().padStart(2, "0")}`
        : suggestion?.gross
          ? `${BigInt(suggestion.gross) / 100n}.${(BigInt(suggestion.gross) % 100n).toString().padStart(2, "0")}`
          : "",
    ),
    [confirmed, setConfirmed] = useState(false);
  let unchanged = false;
  try {
    unchanged =
      !!previous &&
      supplier.trim() === previous.supplier &&
      number.trim() === previous.invoice_number &&
      date === previous.invoice_date &&
      description.trim() === previous.description &&
      cents(gross) === previous.gross;
  } catch {
    /* incomplete amount cannot be posted */
  }
  if (previous?.journal_id || previous?.superseded)
    return <p className="text-sm text-neutral-400">{t("financeDocs.immutable")}</p>;
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const ok = await submit({
        action: "draft",
        id,
        document: document.id,
        supplier,
        number,
        date,
        description,
        gross: cents(gross),
        replaces: previous?.id ?? null,
        confirmed: true,
        postNow: canPost,
      });
      if (ok) {
        setId(crypto.randomUUID());
        setConfirmed(false);
      }
    } catch (err) {
      toast.error(String(err));
    }
  }
  return (
    <form className="space-y-4 rounded-xl border border-yellow-400/25 p-5" onSubmit={save}>
      <h3 className="text-xl">{t("financeDocs.expenseReview")}</h3>
      <p className="text-sm text-neutral-400">{t("financeDocs.manualReview")}</p>
      <label className="block">
        {i18n.language.startsWith("de")
          ? "Gespeicherter Lieferant (optional)"
          : "Saved supplier (optional)"}
        <select
          className={field}
          value=""
          onChange={(e) => {
            const s = suppliers.data?.suppliers.find((s) => s.id === e.target.value);
            if (s) setSupplier(s.name);
          }}
        >
          <option value="">—</option>
          {suppliers.data?.suppliers
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.country} · {s.tax_id}
              </option>
            ))}
        </select>
      </label>
      {[
        ["supplier", supplier, setSupplier],
        ["invoiceNumber", number, setNumber],
        ["description", description, setDescription],
      ].map(([label, value, setter]) => (
        <label className="block" key={String(label)}>
          {t(`financeDocs.${label}`)}
          <input
            className={field}
            required
            value={String(value)}
            maxLength={label === "description" ? 1000 : 200}
            onChange={(e) => (setter as (v: string) => void)(e.target.value)}
          />
        </label>
      ))}
      <label className="block">
        {t("financeDocs.invoiceDate")}
        <input
          className={field}
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="block">
        {t("financeDocs.gross")}
        <input
          className={field}
          inputMode="decimal"
          required
          value={gross}
          onChange={(e) => setGross(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          required
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("financeDocs.confirmDomestic")}
      </label>
      <button disabled={busy || !confirmed} className={button}>
        {t(canPost ? "financeDocs.saveAndPost" : "financeDocs.saveReview")}
      </button>
      {canPost && previous && (
        <button
          type="button"
          className={button}
          disabled={busy || !confirmed || !unchanged}
          onClick={() => submit({ action: "post", id: previous.id })}
        >
          {t("financeDocs.postReviewed")}
        </button>
      )}
      {previous && !unchanged && (
        <p className="text-sm text-neutral-400">{t("financeDocs.saveChangesFirst")}</p>
      )}
    </form>
  );
}
function PaymentForm({
  accounts,
  expense,
  documents,
  busy,
  submit,
}: {
  accounts: CashAccount[];
  expense: FinanceExpense;
  documents: FinanceDocument[];
  busy: boolean;
  submit: (data: ExpenseCommand) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [id] = useState(() => crypto.randomUUID()),
    [document, setDocument] = useState(""),
    [date, setDate] = useState(today()),
    [amount, setAmount] = useState(""),
    [account, setAccount] = useState("BANK"),
    [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className="space-y-4 rounded-xl border border-yellow-400/30 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await submit({
            action: "payment",
            id,
            expense: expense.id,
            document,
            date,
            amount: cents(amount),
            account,
            confirmed: true,
          });
        } catch (err) {
          toast.error(String(err));
        }
      }}
    >
      <h3 className="text-xl">
        {t("financeDocs.recordPayment")}: {expense.invoice_number}
      </h3>
      <p className="text-sm text-neutral-400">{t("financeDocs.paymentOnly")}</p>
      <label className="block">
        {t("financeDocs.evidence")}
        <select
          required
          className={field}
          value={document}
          onChange={(e) => setDocument(e.target.value)}
        >
          <option value="">{t("financeDocs.chooseOriginal")}</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.filename}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {t("financeDocs.paymentDate")}
        <input
          required
          type="date"
          className={field}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="block">
        {t("financeDocs.paymentAmount")}
        <input
          required
          inputMode="decimal"
          className={field}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label className="block">
        {t("financeDocs.paidFrom")}
        <select
          className={field}
          value={account}
          onChange={(e) => setAccount(e.target.value as typeof account)}
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
      <label className="flex gap-3 text-sm">
        <input
          required
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("financeDocs.confirmPayment")}
      </label>
      <button className={button} disabled={busy || !confirmed}>
        {t("financeDocs.recordPayment")}
      </button>
    </form>
  );
}
