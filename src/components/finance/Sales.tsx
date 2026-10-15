import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  financeSalesList,
  financeSalesAction,
  financeSalesOriginal,
  financeRefundPay,
} from "@/lib/finance-sales.functions";
import { listFinanceDocuments } from "@/lib/finance-documents.functions";
import { cents, euros } from "@/lib/finance/money";
type CashAccount = { code: string; name_de: string; cash_kind?: "bank" | "cash" | null };
export function FinanceSales({ role, accounts }: { role: string; accounts: CashAccount[] }) {
  const { t, i18n } = useTranslation(),
    user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient(),
    read = useServerFn(financeSalesList),
    action = useServerFn(financeSalesAction);
  const [refund, setRefund] = useState<string | null>(null);
  const original = useServerFn(financeSalesOriginal);
  async function download(id: string) {
    try {
      const data = await original({ data: { id } });
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))], {
          type: "application/pdf",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = data.number + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["finance-sales", user, page],
    queryFn: () => read({ data: { page } }),
    enabled: !!user,
    retry: false,
  });
  async function run(id?: string) {
    setBusy(true);
    try {
      const r = await action({
        data: id ? { action: "import", id, confirmed: true } : { action: "rescan" },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["finance-sales"] }),
        qc.invalidateQueries({ queryKey: ["finance"] }),
      ]);
      if (r.error) toast.error(r.error);
      else {
        toast.success(t("finance.saved"));
        setSelected(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">{t("financeSales.title")}</h2>
      <p className="max-w-4xl text-neutral-400">{t("financeSales.scope")}</p>
      {role === "owner" && (
        <button
          className="rounded border border-yellow-400/40 px-4 py-2 text-yellow-300"
          disabled={busy}
          onClick={() => run()}
        >
          {t("financeSales.rescan")}
        </button>
      )}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">{t("finance.loading")}</p>}
      {query.data?.length === 0 && <p>{t("financeSales.empty")}</p>}
      {query.data?.map((e) => (
        <article className="space-y-3 rounded-xl border border-white/15 p-5" key={e.id}>
          <div className="flex flex-wrap justify-between gap-3">
            <h3>
              {e.invoice_number} · {e.kind}
            </h3>
            <span>
              {e.gross && e.rounding && /^-?\d+$/.test(e.gross) && /^-?\d+$/.test(e.rounding)
                ? euros(
                    (BigInt(e.gross) + BigInt(e.rounding)).toString(),
                    i18n.language.startsWith("de"),
                  )
                : "—"}
            </span>
          </div>
          <p className="break-all text-sm text-neutral-400">
            {t("financeSales.source")}: {e.order_id} · {e.paid_date} · {e.currency} · {e.tax_mode}
          </p>
          <button className="text-yellow-300 underline" onClick={() => download(e.id)}>
            {t("financeDocs.download")}
          </button>
          <p>{e.journal_id ? t("finance.posted") : t("financeSales.pending")}</p>
          {e.last_error && (
            <p role="status" className="text-amber-200">
              {e.last_error}
            </p>
          )}
          {e.journal_id && (
            <p className="break-all text-xs text-neutral-400">
              {t("financeSales.journal")}: {e.journal_id}
            </p>
          )}
          {!e.journal_id && ["owner", "accountant"].includes(role) && (
            <>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected === e.id}
                  onChange={(ev) => setSelected(ev.target.checked ? e.id : null)}
                />
                {t("financeSales.confirm")}
              </label>
              <button
                className="rounded-lg bg-[#FFD700] px-4 py-2 font-semibold text-black disabled:opacity-40"
                disabled={busy || selected !== e.id}
                onClick={() => run(e.id)}
              >
                {t("financeSales.import")}
              </button>
            </>
          )}
          {e.kind === "credit" && e.journal_id && (
            <>
              <p>
                {i18n.language.startsWith("de") ? "Erstattet" : "Refund paid"}:{" "}
                {euros(e.refunded, i18n.language.startsWith("de"))}
              </p>
              {["owner", "accountant"].includes(role) && (
                <button
                  className="text-yellow-300 underline"
                  onClick={() => setRefund(refund === e.id ? null : e.id)}
                >
                  {i18n.language.startsWith("de")
                    ? "Tatsächliche Erstattung erfassen"
                    : "Record actual refund"}
                </button>
              )}
              {refund === e.id && (
                <RefundForm
                  accounts={accounts}
                  event={e.id}
                  done={async () => {
                    setRefund(null);
                    await Promise.all([
                      qc.invalidateQueries({ queryKey: ["finance-sales"] }),
                      qc.invalidateQueries({ queryKey: ["finance"] }),
                    ]);
                  }}
                />
              )}
            </>
          )}
        </article>
      ))}
      <div className="flex gap-4">
        <button disabled={page === 0 || busy} onClick={() => setPage((p) => p - 1)}>
          {t("financeDocs.previous")}
        </button>
        <span>{page + 1}</span>
        <button
          disabled={busy || !query.data || query.data.length < 30}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("financeDocs.next")}
        </button>
      </div>
    </section>
  );
}

function RefundForm({
  event,
  accounts,
  done,
}: {
  event: string;
  accounts: CashAccount[];
  done: () => Promise<void>;
}) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    read = useServerFn(listFinanceDocuments),
    pay = useServerFn(financeRefundPay);
  const [id] = useState(() => crypto.randomUUID()),
    [search, setSearch] = useState(""),
    [document, setDocument] = useState(""),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(""),
    [amount, setAmount] = useState(""),
    [account, setAccount] = useState("BANK"),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["finance-refund-docs", user, search],
    queryFn: () => read({ data: { search, page: 0 } }),
    enabled: !!user,
    retry: false,
  });
  const field = "w-full rounded border border-white/20 bg-neutral-950 p-3 text-white";
  return (
    <form
      className="space-y-3 border-t border-yellow-400/30 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await pay({
            data: {
              id,
              event,
              document,
              reference,
              date,
              amount: cents(amount),
              account,
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
      <p className="text-amber-200">
        {say(
          "Nur bereits ausgeführte Erstattungen erfassen. Dies sendet kein Geld.",
          "Record refunds already completed. This does not send money.",
        )}
      </p>
      <label className="block">
        {say("Zahlungsbeleg suchen", "Find payment evidence")}
        <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {q.error && <p role="alert">{q.error.message}</p>}
      <label className="block">
        {say("Original", "Original")}
        <select
          className={field}
          required
          value={document}
          onChange={(e) => setDocument(e.target.value)}
        >
          <option value="">—</option>
          {q.data?.documents
            .filter((d) => d.state === "ready")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
        </select>
      </label>
      {[
        [
          say("Eindeutige Zahlungsreferenz", "Unique payment reference"),
          reference,
          setReference,
          "text",
        ],
        [say("Zahlungsdatum", "Payment date"), date, setDate, "date"],
        ["EUR", amount, setAmount, "text"],
      ].map(([label, value, set, type]) => (
        <label className="block" key={String(label)}>
          {String(label)}
          <input
            className={field}
            required
            value={String(value)}
            type={String(type)}
            onChange={(e) => (set as (s: string) => void)(e.target.value)}
          />
        </label>
      ))}
      <label className="block">
        {say("Auszahlungskonto", "Payment account")}
        <select className={field} value={account} onChange={(e) => setAccount(e.target.value)}>
          {accounts
            .filter((a) => a.cash_kind || ["BANK", "CASH", "CLEARING"].includes(a.code))
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
          "Zahlung und Original geprüft; noch nicht verbucht.",
          "Payment and original verified; not already recorded.",
        )}
      </label>
      <button
        className="rounded bg-yellow-400 px-4 py-2 text-black disabled:opacity-40"
        disabled={busy}
      >
        {say("Erstattung buchen", "Post refund")}
      </button>
    </form>
  );
}
