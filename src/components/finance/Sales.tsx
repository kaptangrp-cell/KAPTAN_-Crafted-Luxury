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
} from "@/lib/finance-sales.functions";
import { euros } from "@/lib/finance/money";
export function FinanceSales({ role }: { role: string }) {
  const { t, i18n } = useTranslation(),
    user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient(),
    read = useServerFn(financeSalesList),
    action = useServerFn(financeSalesAction);
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
          {!e.journal_id && e.kind === "advance" && ["owner", "accountant"].includes(role) && (
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
          {e.kind !== "advance" && !e.journal_id && (
            <p className="text-sm text-amber-200">{t("financeSales.manual")}</p>
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
