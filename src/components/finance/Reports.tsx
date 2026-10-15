import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { financeReport } from "@/lib/finance.functions";
import { summarizeReport, reportCsv } from "@/lib/finance/reports";
import { euros } from "@/lib/finance/money";
import { useAuthStore } from "@/stores/authStore";
export function FinanceReports({ from, to }: { from: string; to: string }) {
  const { t, i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    user = useAuthStore((s) => s.user?.id);
  const read = useServerFn(financeReport),
    query = useQuery({
      queryKey: ["finance", "report", user, from, to],
      queryFn: () => read({ data: { from, to } }),
      enabled: !!user,
      retry: false,
    });
  if (query.isPending) return <p role="status">{t("finance.loading")}</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  const data = query.data,
    s = summarizeReport(data);
  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([reportCsv(data, de)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `Kaptan-ledger-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <h2 className="text-2xl">{t("financeReports.title")}</h2>
        <button
          className="rounded-lg border border-yellow-400/40 px-4 py-2 text-yellow-300"
          onClick={exportCsv}
        >
          {t("financeReports.export")}
        </button>
      </div>
      <p className="max-w-4xl text-sm text-neutral-400">{t("financeReports.provisional")}</p>
      <p>
        {data.postedCount} {t("financeReports.posted")} · {data.draftCount}{" "}
        {t("financeReports.drafts")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            "revenue",
            "expenses",
            "profit",
            "bank",
            "inventory",
            "receivables",
            "payables",
            "cashClosing",
          ] as const
        ).map((key) => (
          <div className="rounded-xl border border-white/15 p-5" key={key}>
            <p className="text-sm text-neutral-400">{t(`financeReports.${key}`)}</p>
            <p className="mt-2 text-2xl text-[#FFD700]">{euros(s[key], de)}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-white/15 p-5">
          <h3 className="mb-4 text-xl">{t("financeReports.position")}</h3>
          {(["assets", "liabilities", "equity", "balanceGap"] as const).map((key) => (
            <div className="flex justify-between gap-4 py-2" key={key}>
              <span>{t(`financeReports.${key}`)}</span>
              <span>{euros(s[key], de)}</span>
            </div>
          ))}
        </section>
        <section className="rounded-xl border border-white/15 p-5">
          <h3 className="mb-4 text-xl">{t("financeReports.cash")}</h3>
          {(["cashOpening", "inflow", "outflow", "cashClosing", "cashGap"] as const).map((key) => (
            <div key={key} className="flex justify-between gap-4 py-2">
              <span>{t(`financeReports.${key}`)}</span>
              <span>
                {euros(key === "inflow" || key === "outflow" ? data.cash[key] : s[key], de)}
              </span>
            </div>
          ))}
        </section>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["account", "opening", "debit", "credit", "closing"].map((k) => (
                <th className="px-2 py-3 text-left" key={k}>
                  {t(`financeReports.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.code} className="border-t border-white/10">
                <td className="p-2">
                  {a.code} · {de ? a.name_de : a.name_en}
                </td>
                {(["opening", "debit", "credit", "closing"] as const).map((k) => (
                  <td className="p-2 text-right tabular-nums" key={k}>
                    {euros(a[k], de)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
