import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { financeSnapshot, financeCommand, type FinanceCommand } from "@/lib/finance.functions";
import { cents, euros } from "@/lib/finance/money";
import { useAuthStore } from "@/stores/authStore";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export const Route = createFileRoute("/_authenticated/finance")({
  component: Finance,
  head: () => ({ meta: [{ title: "KAPTAN Finance" }] }),
});
const field =
  "w-full rounded-lg border border-white/20 bg-neutral-950 p-3 text-white focus:outline focus:outline-2 focus:outline-yellow-400";
const button = "rounded-lg bg-[#FFD700] px-4 py-2 font-semibold text-black disabled:opacity-40";
function Finance() {
  const { i18n, t } = useTranslation();
  const de = i18n.language.startsWith("de");
  const userId = useAuthStore((s) => s.user?.id);
  const [from, setFrom] = useState("2026-01-01"),
    [to, setTo] = useState("2026-12-31"),
    [tab, setTab] = useState("ledger"),
    [busy, setBusy] = useState(false);
  const read = useServerFn(financeSnapshot),
    command = useServerFn(financeCommand),
    qc = useQueryClient();
  const query = useQuery({
    queryKey: ["finance", userId, from, to],
    queryFn: () => read({ data: { from, to } }),
    retry: false,
    enabled: Boolean(userId),
  });
  const data = query.data;
  const [date, setDate] = useState(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const [memo, setMemo] = useState(""),
    [reference, setReference] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState([
    { account: "BANK", debit: "", credit: "" },
    { account: "CAPITAL", debit: "", credit: "" },
  ]);
  const [reason, setReason] = useState(""),
    [user, setUser] = useState(""),
    [role, setRole] = useState<"accountant" | "staff" | "auditor">("staff");
  async function run(input: FinanceCommand) {
    setBusy(true);
    try {
      await command({ data: input });
      await qc.invalidateQueries({ queryKey: ["finance"] });
      toast.success(t("finance.saved"));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const canPost = data?.role === "owner" || data?.role === "accountant";
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white md:px-10">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-yellow-400/25 pb-6">
          <div>
            <Link to="/" className="font-serif text-2xl tracking-widest text-[#FFD700]">
              KAPTAN
            </Link>
            <h1 className="mt-2 text-3xl">Finance</h1>
            <p className="mt-2 text-sm text-neutral-400">
              EÜR · 2026 · {t("finance.internalAccountsMappingPending")}
            </p>
          </div>
          <LanguageSwitcher />
        </header>
        <p className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4 text-sm text-yellow-100">
          {t(
            "finance.foundationManualLedgerAndAccessControlsStoreSynchronizationDocumentUploadAndTaxReportsAreNotEnabledY",
          )}
        </p>
        <div className="flex flex-wrap gap-4">
          <label>
            {t("finance.from")}
            <input
              aria-label={t("finance.from")}
              type="date"
              className={field}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t("finance.to")}
            <input
              aria-label={t("finance.to")}
              type="date"
              className={field}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        {query.isPending ? (
          <p role="status">{t("finance.loading")}</p>
        ) : query.error ? (
          <div role="alert" className="rounded-xl border border-red-400/40 p-5">
            {query.error.message}
            <button className="ml-4 underline" onClick={() => query.refetch()}>
              {t("finance.retry")}
            </button>
          </div>
        ) : (
          data && (
            <>
              <nav className="flex flex-wrap gap-2" aria-label="Finance">
                {[
                  ["ledger", t("finance.journals")],
                  ["trial", t("finance.trialBalance")],
                  ["periods", t("finance.periods")],
                  ["audit", t("finance.auditTrail")],
                  ...(data.role === "owner" ? [["access", t("finance.access")]] : []),
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={tab === id ? button : "rounded-lg border border-white/20 px-4 py-2"}
                    onClick={() => setTab(id)}
                    aria-pressed={tab === id}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {tab === "ledger" && (
                <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
                  <section className="space-y-3">
                    <h2 className="text-xl">{t("finance.latest100JournalsInRange")}</h2>
                    {!data.journals.length && (
                      <p className="py-10 text-neutral-400">
                        {t("finance.noJournalsYetNoTestDataOrHistoricOrdersHaveBeenImported")}
                      </p>
                    )}
                    {data.journals.map((j) => (
                      <details key={j.id} className="rounded-xl border border-white/15 p-4">
                        <summary className="cursor-pointer">
                          <span className="text-neutral-400">
                            {j.booking_date} ·{" "}
                            {j.status === "posted" ? t("finance.posted") : t("finance.draft")}
                          </span>
                          <p className="mt-1">{j.memo}</p>
                        </summary>
                        <p className="my-3 break-all text-sm text-neutral-400">
                          {String(j.source.reference)}
                        </p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="text-left">{t("finance.account")}</th>
                              <th>{t("finance.debit")}</th>
                              <th>{t("finance.credit")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {j.lines.map((l, i) => (
                              <tr key={i}>
                                <td className="py-2">{l.account}</td>
                                <td className="text-right">{euros(l.debit, de)}</td>
                                <td className="text-right">{euros(l.credit, de)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {canPost && j.status === "draft" && (
                          <button
                            disabled={busy}
                            className={button + " mt-4"}
                            onClick={() => run({ action: "post", id: j.id })}
                          >
                            {t("finance.postJournal")}
                          </button>
                        )}
                        {canPost && j.status === "posted" && !j.reversal_of && (
                          <button
                            disabled={busy || reason.trim().length < 5}
                            className="mt-4 rounded border border-white/30 px-3 py-2 disabled:opacity-40"
                            onClick={() => run({ action: "reverse", id: j.id, date, reason })}
                          >
                            {t("finance.reverseWithReason")}
                          </button>
                        )}
                      </details>
                    ))}
                  </section>
                  {data.role !== "auditor" && (
                    <form
                      className="space-y-4 rounded-xl border border-yellow-400/25 p-5"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          const ok = await run({
                            action: "submit",
                            key,
                            date,
                            memo,
                            reference,
                            lines: lines.map((l) => ({
                              account: l.account,
                              debit: cents(l.debit || "0"),
                              credit: cents(l.credit || "0"),
                            })),
                          });
                          if (ok) {
                            setKey(crypto.randomUUID());
                            setMemo("");
                            setReference("");
                          }
                        } catch (err) {
                          toast.error(String(err));
                        }
                      }}
                    >
                      <h2 className="text-xl">{t("finance.newJournalDraft")}</h2>
                      <label className="block">
                        {t("finance.date")}
                        <input
                          required
                          type="date"
                          className={field}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        {t("finance.description")}
                        <input
                          required
                          minLength={3}
                          maxLength={1000}
                          className={field}
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        {t("finance.sourceReference")}
                        <input
                          required
                          className={field}
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </label>
                      {lines.map((l, i) => (
                        <fieldset key={i} className="space-y-2 border-t border-white/10 pt-3">
                          <legend>
                            {t("finance.line")} {i + 1}
                          </legend>
                          <select
                            aria-label={t("finance.account")}
                            className={field}
                            value={l.account}
                            onChange={(e) =>
                              setLines(
                                lines.map((x, n) =>
                                  n === i ? { ...x, account: e.target.value } : x,
                                ),
                              )
                            }
                          >
                            {data.accounts
                              .filter((a) => a.active)
                              .map((a) => (
                                <option key={a.code} value={a.code}>
                                  {de ? a.name_de : a.name_en}
                                </option>
                              ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            {(["debit", "credit"] as const).map((side) => (
                              <label key={side}>
                                {side === "debit" ? t("finance.debit") : t("finance.credit")}
                                <input
                                  inputMode="decimal"
                                  className={field}
                                  value={l[side]}
                                  onChange={(e) =>
                                    setLines(
                                      lines.map((x, n) =>
                                        n === i ? { ...x, [side]: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          {i > 1 && (
                            <button
                              type="button"
                              className="text-sm underline"
                              onClick={() => setLines(lines.filter((_, n) => n !== i))}
                            >
                              {t("finance.remove")}
                            </button>
                          )}
                        </fieldset>
                      ))}
                      <button
                        type="button"
                        className="underline"
                        disabled={lines.length >= 200}
                        onClick={() =>
                          setLines([...lines, { account: "EXPENSE", debit: "", credit: "" }])
                        }
                      >
                        {t("finance.addLine")}
                      </button>
                      <button className={button + " block"} disabled={busy}>
                        {t("finance.saveDraft")}
                      </button>
                      <p className="text-xs text-neutral-400">
                        {t("finance.debitsAndCreditsMustBalancePostedEntriesCanOnlyBeReversed")}
                      </p>
                    </form>
                  )}
                </div>
              )}
              {tab === "trial" && (
                <div className="overflow-x-auto">
                  <h2 className="mb-4 text-xl">{t("finance.periodMovementsPostedJournalsOnly")}</h2>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left">{t("finance.account")}</th>
                        <th>{t("finance.debit")}</th>
                        <th>{t("finance.credit")}</th>
                        <th>{t("finance.balanceDebitCredit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trial.map((row) => (
                        <tr key={row.account} className="border-b border-white/10">
                          <td className="py-4">
                            {row.account} ·{" "}
                            {
                              data.accounts.find((a) => a.code === row.account)?.[
                                de ? "name_de" : "name_en"
                              ]
                            }
                          </td>
                          <td className="text-right">{euros(row.debit, de)}</td>
                          <td className="text-right">{euros(row.credit, de)}</td>
                          <td className="text-right">
                            {euros((BigInt(row.debit) - BigInt(row.credit)).toString(), de)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(tab === "periods" || tab === "ledger") && canPost && (
                <label className="block max-w-xl">
                  {t("finance.reasonForReversalPeriodChangeMin5Characters")}
                  <input
                    className={field}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              {tab === "periods" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {data.periods.map((p) => (
                    <div key={p.id} className="rounded-xl border border-white/20 p-4">
                      <h3>
                        {p.id.slice(0, 7)} · {p.closed ? t("finance.closed") : t("finance.open")}
                      </h3>
                      {canPost && (!p.closed || data.role === "owner") && (
                        <button
                          className={button + " mt-3"}
                          disabled={busy || reason.trim().length < 5}
                          onClick={() =>
                            run({ action: "period", period: p.id, closed: !p.closed, reason })
                          }
                        >
                          {p.closed ? t("finance.reopen") : t("finance.closePeriod")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {tab === "audit" && (
                <section>
                  <h2 className="mb-4">{t("finance.latest50AuditEvents")}</h2>
                  {data.audit.map((a) => (
                    <div key={a.id} className="border-b border-white/10 py-3 text-sm">
                      <p>
                        {a.at} · {a.event}
                      </p>
                      <p className="break-all text-neutral-400">
                        {a.reference} · {JSON.stringify(a.details)}
                      </p>
                    </div>
                  ))}
                </section>
              )}
              {tab === "access" && data.role === "owner" && (
                <form
                  className="max-w-lg space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run({ action: "member", user, role });
                  }}
                >
                  <h2 className="text-xl">{t("finance.assignFinanceAccess")}</h2>
                  <p className="text-neutral-400">
                    {t(
                      "finance.existingSupabaseUserIdThisRoleDoesNotGrantStoreAdminOrWarehouseAccess",
                    )}
                  </p>
                  <label className="block">
                    {t("finance.userId")}
                    <input
                      required
                      className={field}
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label={t("finance.role")}
                    className={field}
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                  >
                    <option value="staff">{t("finance.financeStaffDrafts")}</option>
                    <option value="accountant">{t("finance.accountantPosting")}</option>
                    <option value="auditor">{t("finance.auditorReadOnly")}</option>
                  </select>
                  <button className={button} disabled={busy}>
                    {t("finance.saveAccess")}
                  </button>
                  <button
                    type="button"
                    className="ml-4 underline"
                    disabled={busy || !user}
                    onClick={() => run({ action: "member", user, role: null })}
                  >
                    {t("finance.removeAccess")}
                  </button>
                </form>
              )}
            </>
          )
        )}
      </div>
    </main>
  );
}
