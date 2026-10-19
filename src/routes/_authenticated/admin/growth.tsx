import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  growthLoad,
  growthSavePlan,
  growthSaveAction,
  growthDeleteAction,
} from "@/lib/growth.functions";
import {
  newPlan,
  allocate,
  PlanSchema,
  ActionSchema,
  report,
  recommendations,
  suggestActions,
  changePercent,
  addDays,
  type Plan,
  type Metrics,
  type Action,
} from "@/lib/growth/model";
import { formatEuro } from "@/lib/currency";
import { CatalogText } from "@/components/common/CatalogText";

export const Route = createFileRoute("/_authenticated/admin/growth")({
  component: GrowthPage,
  head: () => ({ meta: [{ title: "Growth Planner — KAPTAN" }] }),
});
type Loaded = Awaited<ReturnType<typeof growthLoad>>;
const box = "rounded-2xl border border-gold/20 bg-[#0D0D0D] p-4 sm:p-6";
const input = "mt-1 w-full min-w-0 rounded-lg border border-gold/25 bg-black p-2.5 text-white";
const button = "rounded-lg border border-gold/40 px-4 py-2 text-sm text-gold disabled:opacity-40";
const primary = button + " bg-gold/10";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
function GrowthPage() {
  const { i18n } = useTranslation();
  const de = i18n.language.startsWith("de");
  const l = (en: string, ger: string) => (de ? ger : en);
  const load = useServerFn(growthLoad);
  const query = useQuery({
    queryKey: ["growth-planner"],
    queryFn: () => load(),
    refetchInterval: 60000,
  });
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [period, setPeriod] = useState<Plan["period"]>("60days");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-gold">{l("Growth Planner", "Wachstumsplaner")}</h1>
        <p className="mt-2 text-sm text-white/65">
          {l(
            "Goals, practical actions and results from your store. No paid APIs.",
            "Ziele, konkrete Maßnahmen und Ergebnisse aus Ihrem Shop. Ohne kostenpflichtige APIs.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {(["60days", "2027"] as const).map((p) => (
          <button
            key={p}
            aria-pressed={period === p}
            className={period === p ? primary : button}
            onClick={() => {
              if (p === period) return;
              if (
                hasUnsaved &&
                !window.confirm(
                  l("Discard unsaved planner edits?", "Ungespeicherte Planeränderungen verwerfen?"),
                )
              )
                return;
              setHasUnsaved(false);
              setPeriod(p);
            }}
          >
            {p === "60days" ? l("Next 60 days", "Nächste 60 Tage") : "2027"}
          </button>
        ))}
        <button className={button} onClick={() => void query.refetch()} disabled={query.isFetching}>
          {l("Refresh actuals", "Ist-Werte aktualisieren")}
        </button>
      </div>
      {query.isPending ? (
        <p>{l("Loading store data…", "Shopdaten werden geladen…")}</p>
      ) : query.error ? (
        <div role="alert" className={box}>
          <p>{errorText(query.error)}</p>
          <p className="mt-3 text-sm">
            {l(
              "If the migration is missing, apply 20261019090000_growth_planner.sql in Supabase, then retry.",
              "Falls die Migration fehlt: 20261019090000_growth_planner.sql in Supabase anwenden und erneut versuchen.",
            )}
          </p>
        </div>
      ) : query.data ? (
        <Planner
          key={period}
          period={period}
          loaded={query.data}
          refresh={() => query.refetch()}
          de={de}
          onUnsavedChange={setHasUnsaved}
        />
      ) : null}
    </div>
  );
}
function Planner({
  period,
  loaded,
  refresh,
  de,
  onUnsavedChange,
}: {
  period: Plan["period"];
  loaded: Loaded;
  refresh: () => Promise<unknown>;
  de: boolean;
  onUnsavedChange: (dirty: boolean) => void;
}) {
  const l = (en: string, ger: string) => (de ? ger : en);
  const language = de ? "de" : "en";
  const money = (n: number | null) =>
    n === null ? l("Not available", "Nicht verfügbar") : formatEuro(n, language);
  const na = l("Not available", "Nicht verfügbar");
  const pct = (n: number | null) => (n === null ? na : `${n.toFixed(1)} %`);
  const saved = loaded.plans.find((p) => p.data.period === period);
  const [plan, setPlan] = useState<Plan>(() => saved?.data ?? newPlan(period, loaded.today));
  const [identity, setIdentity] = useState({
    id: saved?.id ?? null,
    revision: saved?.revision ?? 0,
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(0);
  const [editor, setEditor] = useState<{
    id: string | null;
    revision: number;
    data: Action;
  } | null>(null);
  useEffect(() => {
    const unsaved = dirty || editor !== null;
    onUnsavedChange(unsaved);
    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editor, onUnsavedChange]);
  const [proposals, setProposals] = useState<Action[]>([]);
  const savePlan = useServerFn(growthSavePlan),
    saveAction = useServerFn(growthSaveAction),
    deleteAction = useServerFn(growthDeleteAction);
  const update = (next: Plan) => {
    setPlan(next);
    setDirty(true);
  };
  const r = report(plan, loaded.sales, loaded.stock, loaded.today);
  const actions = loaded.actions
    .filter((a) => a.plan_id === identity.id)
    .sort((a, b) => a.data.deadline.localeCompare(b.data.deadline));
  const labels: Record<keyof Metrics, string> = {
    revenue: l("Revenue target (€)", "Umsatzziel (€)"),
    orders: l("Order target", "Bestellziel"),
    margin: l("Margin target (%)", "Margenziel (%)"),
    budget: l("Marketing budget (€)", "Marketingbudget (€)"),
    customers: l("New buyer target", "Ziel: neue Käufer"),
    traffic: l("Website visits target", "Ziel: Website-Besuche"),
    social: l("New social followers target", "Ziel: neue Social-Media-Follower"),
  };
  async function persist() {
    setBusy(true);
    try {
      const parsed = PlanSchema.parse(plan);
      const result = await savePlan({ data: { ...identity, plan: parsed } });
      setIdentity(result);
      setDirty(false);
      await refresh();
      toast.success(l("Plan saved", "Plan gespeichert"));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function persistAction(data: Action, id: string | null = null, revision = 0) {
    if (!identity.id) return;
    setBusy(true);
    try {
      await saveAction({
        data: { id, revision, planId: identity.id, action: ActionSchema.parse(data) },
      });
      setEditor(null);
      setProposals((p) => p.filter((a) => a !== data));
      await refresh();
      toast.success(l("Action saved", "Maßnahme gespeichert"));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const targetFields = (targets: Metrics, onChange: (m: Metrics) => void) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(labels) as (keyof Metrics)[]).map((k) => (
        <label key={k} className="text-sm text-white/75">
          {labels[k]}
          <input
            aria-label={labels[k]}
            type="number"
            min="0"
            max={k === "margin" ? 100 : 100000000}
            step={["orders", "customers", "traffic", "social"].includes(k) ? 1 : 0.01}
            className={input}
            value={targets[k]}
            onChange={(e) => onChange({ ...targets, [k]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
  const requiredOrders =
    r.requiredPerDay !== null && r.total.aov ? Math.ceil(r.requiredPerDay / r.total.aov) : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-white/65">
          {plan.start} – {addDays(plan.buckets.at(-1)!.end, -1)} ·{" "}
          {l("Europe/Berlin dates", "Datumsgrenzen: Europa/Berlin")}
        </p>
        <span className="text-sm text-amber-200">
          {dirty
            ? l(
                "Unsaved changes — save before switching periods",
                "Ungespeicherte Änderungen – vor Periodenwechsel speichern",
              )
            : !identity.id
              ? l(
                  "New plan — save to enable actions",
                  "Neuer Plan – zum Aktivieren der Maßnahmen speichern",
                )
              : l("Saved", "Gespeichert")}
        </span>
        <button
          className={button}
          disabled={busy}
          onClick={() => {
            if (
              (dirty || editor) &&
              !window.confirm(
                l(
                  "Discard local changes and load the latest saved plan?",
                  "Lokale Änderungen verwerfen und den neuesten gespeicherten Plan laden?",
                ),
              )
            )
              return;
            setPlan(saved?.data ?? newPlan(period, loaded.today));
            setIdentity({ id: saved?.id ?? null, revision: saved?.revision ?? 0 });
            setDirty(false);
            setEditor(null);
            setProposals([]);
          }}
        >
          {l("Reload saved plan", "Gespeicherten Plan laden")}
        </button>
        <button className={primary} disabled={busy} onClick={() => void persist()}>
          {l("Save goals & reviews", "Ziele und Auswertungen speichern")}
        </button>
      </div>
      <nav
        className="flex gap-2 overflow-x-auto"
        aria-label={l("Planner sections", "Planerbereiche")}
      >
        {[
          l("Goals & Forecast", "Ziele & Prognose"),
          l("Marketing & Sales Plan", "Marketing- & Verkaufsplan"),
          l("Performance", "Leistung"),
          l("Recommendations", "Empfehlungen"),
        ].map((name, i) => (
          <button
            key={name}
            aria-current={tab === i ? "page" : undefined}
            className={`${tab === i ? primary : button} shrink-0`}
            onClick={() => setTab(i)}
          >
            {name}
          </button>
        ))}
      </nav>
      <p className="text-xs leading-relaxed text-white/60">
        {l(
          "Planning figures, not accounting statements. Revenue is paid order value including shipping/tax, by order date; cancelled/unpaid/fully refunded orders are excluded. Partial refunds make affected revenue/profit unavailable. Gross profit is an estimate using current product costs and order discounts, before shipping costs, tax adjustment, fees and advertising. New buyers are first paid purchasers matched by email (account ID fallback). Traffic/social/spend are manual reviewed figures; no visitor tracking is enabled.",
          "Planungszahlen, keine Buchhaltungsauswertung. Umsatz = bezahlter Bestellwert inklusive Versand/Steuern nach Bestelldatum; stornierte, unbezahlte und vollständig erstattete Bestellungen sind ausgeschlossen. Teilrückerstattungen machen betroffene Umsatz-/Gewinnwerte unverfügbar. Rohertrag ist eine Schätzung mit aktuellen Produktkosten und Bestellrabatten, vor Versandkosten, Steuerbereinigung, Gebühren und Werbung. Neue Käufer = erste bezahlte Bestellung, zugeordnet über E-Mail (ersatzweise Konto-ID). Traffic/Social/Ausgaben werden manuell geprüft erfasst; Besuchertracking bleibt deaktiviert.",
        )}
      </p>
      {tab === 0 && (
        <>
          <section className={box}>
            <h2 className="mb-4 font-serif text-xl">{l("Set your goals", "Ziele festlegen")}</h2>
            {period === "60days" && !identity.id && (
              <label className="mb-4 block text-sm">
                {l("Start date (fixed once saved)", "Startdatum (nach Speichern fest)")}
                <input
                  type="date"
                  className={input}
                  value={plan.start}
                  onChange={(e) => {
                    if (e.target.value)
                      update({ ...newPlan(period, e.target.value), targets: plan.targets });
                  }}
                />
              </label>
            )}
            {targetFields(plan.targets, (t) => update({ ...plan, targets: t }))}
            <button className={`${button} mt-4`} onClick={() => update(allocate(plan))}>
              {l("Distribute total targets across periods", "Gesamtziele auf Zeiträume verteilen")}
            </button>
            <p className="mt-2 text-xs text-white/55">
              {l(
                "Distribution uses days per period. Edit individual periods below; their totals must match the overall goals before saving.",
                "Verteilung nach Tagen je Zeitraum. Einzelziele unten bearbeiten; ihre Summen müssen vor dem Speichern den Gesamtzielen entsprechen.",
              )}
            </p>
          </section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [l("Revenue so far", "Bisheriger Umsatz"), money(r.total.revenue)],
              [
                l("Orders / AOV", "Bestellungen / Ø Bestellwert"),
                `${r.total.orders} / ${money(r.total.aov)}`,
              ],
              [l("Target achievement", "Zielerreichung"), pct(r.achievement)],
              [l("Revenue remaining", "Verbleibender Umsatz"), money(r.remaining)],
              [l("Estimated gross profit", "Geschätzter Rohertrag"), money(r.total.profit)],
              [
                l(
                  "Revenue growth vs previous equal period",
                  "Umsatzwachstum zur vorherigen gleich langen Periode",
                ),
                pct(changePercent(r.total.revenue, r.previous.revenue)),
              ],
              [
                l(
                  "Average revenue required per remaining planning period",
                  "Durchschnittlich nötiger Umsatz je verbleibendem Planungszeitraum",
                ),
                money(
                  r.requiredPerDay === null ? null : r.remaining! / Math.max(1, r.remainingPeriods),
                ),
              ],
              [
                l(
                  "Required orders per day at current AOV",
                  "Nötige Bestellungen pro Tag bei aktuellem Ø Bestellwert",
                ),
                requiredOrders ?? na,
              ],
            ].map(([label, value]) => (
              <div key={String(label)} className={box}>
                <p className="text-xs text-white/60">{label}</p>
                <p className="mt-2 text-xl text-gold">{value}</p>
              </div>
            ))}
          </div>
          <section className={box}>
            <h2 className="font-serif text-xl">
              {l("Editable scenarios", "Bearbeitbare Szenarien")}
            </h2>
            <p className="my-3 text-sm text-white/65">
              {l(
                "Baseline: paid orders and AOV from the last 28 complete days; requires 28 days of history and 5 paid orders. Otherwise enter manual daily orders and AOV. Growth is a manual uplift on future revenue, not a measured trend. Identical inputs produce identical forecasts; scenario names do not invent multipliers. Forecast = actual + daily orders × AOV × (1 + uplift) × remaining full days.",
                "Basis: bezahlte Bestellungen und Ø Bestellwert der letzten 28 vollständigen Tage; benötigt 28 Tage Historie und 5 bezahlte Bestellungen. Sonst tägliche Bestellungen und Ø Bestellwert manuell eintragen. Wachstum ist ein manueller Aufschlag auf zukünftigen Umsatz, kein gemessener Trend. Gleiche Eingaben ergeben gleiche Prognosen. Prognose = Ist + tägliche Bestellungen × Ø Bestellwert × (1 + Aufschlag) × verbleibende volle Tage.",
              )}
            </p>
            <div className="grid gap-4 xl:grid-cols-3">
              {r.forecasts.map((f) => {
                const key = f.name as keyof Plan["scenarios"];
                const s = plan.scenarios[key];
                const names = {
                  conservative: l("Conservative", "Konservativ"),
                  expected: l("Expected", "Erwartet"),
                  optimistic: l("Optimistic", "Optimistisch"),
                };
                return (
                  <div key={key} className="rounded-xl border border-gold/20 p-4">
                    <h3 className="text-lg text-gold">{names[key]}</h3>
                    <p className="my-2 text-xl">{money(f.revenue)}</p>
                    <p className="my-2 text-sm">
                      {l("Forecast orders", "Prognostizierte Bestellungen")}:{" "}
                      {f.orders === null ? na : f.orders.toFixed(1)}
                    </p>
                    <p className="text-xs text-white/60">
                      {f.manual
                        ? l("Manual assumptions", "Manuelle Annahmen")
                        : r.sufficient
                          ? l("Historical run rate", "Historische Verkaufsrate")
                          : l("Insufficient history", "Unzureichende Historie")}
                    </p>
                    {(["dailyOrders", "aov", "growth"] as const).map((k) => (
                      <label className="mt-3 block text-sm" key={k}>
                        {k === "dailyOrders"
                          ? l("Orders/day (blank = history)", "Bestellungen/Tag (leer = Historie)")
                          : k === "aov"
                            ? l("AOV € (blank = history)", "Ø Bestellwert € (leer = Historie)")
                            : l("Manual uplift %", "Manueller Aufschlag %")}
                        <input
                          type="number"
                          min={k === "growth" ? -100 : 0}
                          step="0.01"
                          className={input}
                          value={s[k] ?? ""}
                          onChange={(e) =>
                            update({
                              ...plan,
                              scenarios: {
                                ...plan.scenarios,
                                [key]: {
                                  ...s,
                                  [k]:
                                    e.target.value === "" && k !== "growth"
                                      ? null
                                      : Number(e.target.value),
                                },
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                    <label className="mt-3 block text-sm">
                      {l("Assumption rationale", "Begründung der Annahme")}
                      <textarea
                        className={input}
                        value={s.note}
                        onChange={(e) =>
                          update({
                            ...plan,
                            scenarios: { ...plan.scenarios, [key]: { ...s, note: e.target.value } },
                          })
                        }
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
          <section className={box}>
            <h2 className="mb-4 font-serif text-xl">{l("Period targets", "Periodenziele")}</h2>
            {plan.buckets.map((b, i) => (
              <details key={b.start} className="border-t border-gold/15 py-3">
                <summary className="cursor-pointer text-gold">
                  {b.start} – {addDays(b.end, -1)} · {money(b.targets.revenue)}
                </summary>
                <div className="mt-3">
                  {targetFields(b.targets, (t) =>
                    update({
                      ...plan,
                      buckets: plan.buckets.map((v, n) => (n === i ? { ...v, targets: t } : v)),
                    }),
                  )}
                </div>
              </details>
            ))}
          </section>
        </>
      )}
      {tab === 1 && (
        <>
          <div className={box}>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={!identity.id || dirty || busy}
                className={primary}
                onClick={() =>
                  setProposals(
                    suggestActions(plan, loaded.stock, de).filter(
                      (p) =>
                        !actions.some(
                          (a) => a.data.title === p.title && a.data.deadline === p.deadline,
                        ),
                    ),
                  )
                }
              >
                {l("Generate tailored proposals", "Passende Vorschläge erstellen")}
              </button>
              <button
                disabled={!identity.id || busy}
                className={button}
                onClick={() =>
                  setEditor({
                    id: null,
                    revision: 0,
                    data: {
                      title: "",
                      steps: "",
                      benefit: "",
                      budget: 0,
                      deadline: plan.start,
                      kpi: "",
                      status: "todo",
                    },
                  })
                }
              >
                {l("Add action", "Maßnahme hinzufügen")}
              </button>
            </div>
            <p className="mt-3 text-sm text-white/65">
              {l(
                "Proposals use saved targets, period budgets, stocked products and categories. Review each before adding. Nothing launches ads or sends email.",
                "Vorschläge verwenden gespeicherte Ziele, Periodenbudgets, verfügbare Produkte und Kategorien. Vor dem Hinzufügen prüfen. Es werden keine Anzeigen gestartet oder E-Mails versendet.",
              )}
            </p>
            <p className="mt-3">
              {l("Planned action budget", "Geplantes Maßnahmenbudget")}:{" "}
              {money(actions.reduce((s, a) => s + a.data.budget, 0))} / {money(plan.targets.budget)}{" "}
              · {actions.filter((a) => a.data.status === "done").length}/{actions.length}{" "}
              {l("completed", "abgeschlossen")}
            </p>
            {actions.reduce((s, a) => s + a.data.budget, 0) > plan.targets.budget && (
              <p role="alert" className="mt-2 text-amber-200">
                {l(
                  "Action budgets exceed the goal budget. Review before spending.",
                  "Maßnahmenbudgets überschreiten das Gesamtbudget. Vor Ausgaben prüfen.",
                )}
              </p>
            )}
          </div>
          {proposals.length > 0 && (
            <section className={box}>
              <h2 className="font-serif text-xl">
                {l("Review proposed actions", "Vorgeschlagene Maßnahmen prüfen")}
              </h2>
              {proposals.map((p) => (
                <div key={p.deadline} className="mt-4 border-t border-gold/20 pt-4">
                  <h3 className="text-gold">
                    {p.deadline} · {p.title}
                  </h3>
                  <p className="mt-2 text-sm">{p.steps}</p>
                  <p className="mt-2 text-sm text-white/60">{p.benefit}</p>
                  <p className="my-2 text-sm">
                    KPI: {p.kpi} · {money(p.budget)}
                  </p>
                  <button disabled={busy} className={button} onClick={() => void persistAction(p)}>
                    {l("Add to plan", "Zum Plan hinzufügen")}
                  </button>
                </div>
              ))}
            </section>
          )}
          {editor && (
            <form
              className={box}
              onSubmit={(e) => {
                e.preventDefault();
                void persistAction(editor.data, editor.id, editor.revision);
              }}
            >
              <h2 className="mb-4 font-serif text-xl">{l("Edit action", "Maßnahme bearbeiten")}</h2>
              {(["title", "steps", "benefit", "kpi"] as const).map((k) => (
                <label key={k} className="mb-3 block text-sm">
                  {
                    {
                      title: l("What to do", "Was ist zu tun?"),
                      steps: l("How to do it", "Vorgehen"),
                      benefit: l("Expected benefit (hypothesis)", "Erwarteter Nutzen (Hypothese)"),
                      kpi: l("Success KPI", "Erfolgskennzahl"),
                    }[k]
                  }
                  <textarea
                    required
                    minLength={3}
                    maxLength={
                      k === "steps" ? 2000 : k === "benefit" ? 1000 : k === "kpi" ? 500 : 200
                    }
                    className={input}
                    value={editor.data[k]}
                    onChange={(e) =>
                      setEditor({ ...editor, data: { ...editor.data, [k]: e.target.value } })
                    }
                  />
                </label>
              ))}
              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  {l("Budget €", "Budget €")}
                  <input
                    className={input}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={editor.data.budget}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, budget: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label>
                  {l("Deadline", "Termin")}
                  <input
                    className={input}
                    required
                    type="date"
                    min={plan.start}
                    max={addDays(plan.buckets.at(-1)!.end, -1)}
                    value={editor.data.deadline}
                    onChange={(e) =>
                      setEditor({ ...editor, data: { ...editor.data, deadline: e.target.value } })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    className={input}
                    value={editor.data.status}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, status: e.target.value as Action["status"] },
                      })
                    }
                  >
                    <option value="todo">{l("To do", "Offen")}</option>
                    <option value="progress">{l("In progress", "In Bearbeitung")}</option>
                    <option value="done">{l("Completed", "Abgeschlossen")}</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex gap-3">
                <button className={primary} disabled={busy}>
                  {l("Save action", "Maßnahme speichern")}
                </button>
                <button className={button} type="button" onClick={() => setEditor(null)}>
                  {l("Cancel", "Abbrechen")}
                </button>
              </div>
            </form>
          )}
          <section className={box}>
            <h2 className="mb-4 font-serif text-xl">
              {l("Campaign calendar & checklist", "Kampagnenkalender & Checkliste")}
            </h2>
            {plan.buckets.map((b) => (
              <div className="border-t border-gold/20 py-4" key={b.start}>
                <h3 className="text-gold">
                  {b.start} – {addDays(b.end, -1)}
                </h3>
                {actions
                  .filter((a) => a.data.deadline >= b.start && a.data.deadline < b.end)
                  .map((a) => (
                    <article className="my-3 rounded-lg bg-white/5 p-3" key={a.id}>
                      <label className="flex items-start gap-3">
                        <input
                          className="mt-1 accent-gold"
                          type="checkbox"
                          checked={a.data.status === "done"}
                          disabled={busy}
                          onChange={(e) =>
                            void persistAction(
                              { ...a.data, status: e.target.checked ? "done" : "todo" },
                              a.id,
                              a.revision,
                            )
                          }
                        />
                        <span>
                          {a.data.deadline} · {a.data.title} · {money(a.data.budget)} ·{" "}
                          {a.data.status === "done"
                            ? l("Completed", "Abgeschlossen")
                            : a.data.status === "progress"
                              ? l("In progress", "In Bearbeitung")
                              : l("To do", "Offen")}
                        </span>
                      </label>
                      <p className="mt-2 whitespace-pre-line text-sm text-white/70">
                        {a.data.steps}
                      </p>
                      <p className="mt-2 text-sm text-white/60">{a.data.benefit}</p>
                      <p className="mt-2 text-sm">KPI: {a.data.kpi}</p>
                      <div className="mt-3 flex gap-3">
                        <button className={button} onClick={() => setEditor(a)}>
                          {l("Edit", "Bearbeiten")}
                        </button>
                        <button
                          className={button}
                          disabled={busy}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                l(
                                  "Delete this planning action?",
                                  "Diese Planungsmaßnahme löschen?",
                                ),
                              )
                            )
                              return;
                            setBusy(true);
                            try {
                              await deleteAction({ data: { id: a.id, revision: a.revision } });
                              await refresh();
                            } catch (e) {
                              toast.error(errorText(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {l("Delete", "Löschen")}
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            ))}
          </section>
        </>
      )}
      {tab === 2 && (
        <>
          <section className={box}>
            <h2 className="font-serif text-xl">
              {l("Revenue and estimated gross profit", "Umsatz und geschätzter Rohertrag")}
            </h2>
            <div
              className="mt-4 h-72 min-w-0"
              role="img"
              aria-label={l(
                "Revenue and profit chart; exact values in period tables below",
                "Umsatz- und Ertragsdiagramm; genaue Werte in den Tabellen darunter",
              )}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={r.periods.map((b) => ({
                    date: b.start,
                    target: b.targets.revenue,
                    revenue: b.actual?.revenue ?? null,
                    profit: b.actual?.profit ?? null,
                  }))}
                >
                  <CartesianGrid stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#bbb" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#bbb" }} />
                  <Tooltip contentStyle={{ background: "#171717", border: "1px solid #C9A227" }} />
                  <Legend />
                  <Bar dataKey="target" name={l("Target €", "Ziel €")} fill="#625325" />
                  <Bar dataKey="revenue" name={l("Revenue €", "Umsatz €")} fill="#c9a227" />
                  <Bar
                    dataKey="profit"
                    name={l("Estimated profit €", "Geschätzter Ertrag €")}
                    fill="#79af98"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          {r.periods.map((b, i) => {
            const rows: [string, number, number | null, boolean][] = [
              [l("Revenue", "Umsatz"), b.targets.revenue, b.actual?.revenue ?? null, true],
              [l("Orders", "Bestellungen"), b.targets.orders, b.actual?.orders ?? null, false],
              [
                l("Estimated gross profit", "Geschätzter Rohertrag"),
                (b.targets.revenue * b.targets.margin) / 100,
                b.actual?.profit ?? null,
                true,
              ],
              [
                l("Marketing spend (manual)", "Marketingausgaben (manuell)"),
                b.targets.budget,
                b.review.spend,
                true,
              ],
              [
                l("New buyers", "Neue Käufer"),
                b.targets.customers,
                b.actual?.customers ?? null,
                false,
              ],
              [
                l("Visits (manual)", "Besuche (manuell)"),
                b.targets.traffic,
                b.review.traffic,
                false,
              ],
              [
                l("New followers (manual)", "Neue Follower (manuell)"),
                b.targets.social,
                b.review.social,
                false,
              ],
            ];
            return (
              <section key={b.start} className={box}>
                <h2 className="text-lg text-gold">
                  {b.start} – {addDays(b.end, -1)}{" "}
                  {b.partial ? l("(in progress)", "(laufend)") : ""}
                </h2>
                <p className="my-2 text-sm text-white/65">
                  {l("Revenue vs previous period", "Umsatz zur Vorperiode")}:{" "}
                  {pct(changePercent(b.actual?.revenue ?? null, b.previous.revenue))} ·{" "}
                  {l("Orders vs previous period", "Bestellungen zur Vorperiode")}:{" "}
                  {pct(changePercent(b.actual?.orders ?? null, b.previous.orders))} ·{" "}
                  {
                    actions.filter(
                      (a) =>
                        a.data.deadline >= b.start &&
                        a.data.deadline < b.end &&
                        a.data.status === "done",
                    ).length
                  }{" "}
                  {l("completed actions", "abgeschlossene Maßnahmen")}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          l("Metric", "Kennzahl"),
                          l("Target", "Ziel"),
                          l("Actual", "Ist"),
                          l("Difference", "Abweichung"),
                        ].map((v) => (
                          <th className="p-2" key={v}>
                            {v}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([label, target, actual, isMoney]) => (
                        <tr key={label} className="border-t border-gold/10">
                          <td className="p-2">{label}</td>
                          <td className="p-2">{isMoney ? money(target) : target}</td>
                          <td className="p-2">
                            {actual === null ? na : isMoney ? money(actual) : actual}
                          </td>
                          <td className="p-2">{pct(changePercent(actual, target))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-gold">
                    {l(
                      "Record reviewed spend, traffic and followers",
                      "Geprüfte Ausgaben, Besuche und Follower erfassen",
                    )}
                  </summary>
                  <p className="my-2 text-xs text-white/60">
                    {l(
                      "Blank means not available. Enter 0 only after confirming zero. These are manually reported actuals, not linked accounting entries. Save goals & reviews above.",
                      "Leer bedeutet nicht verfügbar. 0 nur nach Prüfung eintragen. Dies sind manuell gemeldete Ist-Werte, keine verknüpften Buchungen. Oben Ziele und Auswertungen speichern.",
                    )}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["spend", "traffic", "social"] as const).map((k) => (
                      <label className="text-sm" key={k}>
                        {
                          {
                            spend: l("Spend €", "Ausgaben €"),
                            traffic: l("Visits", "Besuche"),
                            social: l("New followers", "Neue Follower"),
                          }[k]
                        }
                        <input
                          className={input}
                          type="number"
                          min="0"
                          step={k === "spend" ? 0.01 : 1}
                          value={b.review[k] ?? ""}
                          onChange={(e) =>
                            update({
                              ...plan,
                              buckets: plan.buckets.map((v, n) =>
                                n === i
                                  ? {
                                      ...v,
                                      review: {
                                        ...v.review,
                                        [k]: e.target.value === "" ? null : Number(e.target.value),
                                      },
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 block text-sm">
                    {l("Source / review notes", "Quelle / Prüfnotizen")}
                    <textarea
                      className={input}
                      maxLength={1000}
                      value={b.review.note}
                      onChange={(e) =>
                        update({
                          ...plan,
                          buckets: plan.buckets.map((v, n) =>
                            n === i ? { ...v, review: { ...v.review, note: e.target.value } } : v,
                          ),
                        })
                      }
                    />
                  </label>
                </details>
              </section>
            );
          })}
          <section className={box}>
            <h2 className="mb-3 font-serif text-xl">
              {l("Product performance — best sellers first", "Produktleistung – Bestseller zuerst")}
            </h2>
            <p className="mb-3 text-xs text-white/60">
              {l(
                "Low/no recorded sales do not prove low demand: listing age and exposure are unknown. Values below are item sales before order-level discounts, shipping and tax adjustments.",
                "Wenige/keine erfassten Verkäufe belegen keine geringe Nachfrage: Angebotsalter und Reichweite sind unbekannt. Werte sind Artikelverkäufe vor Bestellrabatten, Versand und Steuerbereinigung.",
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      l("Product", "Produkt"),
                      l("Units", "Stück"),
                      l("Revenue €", "Umsatz €"),
                      l("Stock", "Bestand"),
                      l("Stock cover days", "Reichweite Tage"),
                    ].map((x) => (
                      <th className="p-2" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.products.map((p) => (
                    <tr className="border-t border-gold/10" key={p.id}>
                      <td className="p-2">
                        <CatalogText text={p.name} />
                        {p.units === 0 && (
                          <span className="block text-xs text-white/50">
                            {l("No paid sales in period", "Keine bezahlten Verkäufe im Zeitraum")}
                          </span>
                        )}
                      </td>
                      <td className="p-2">{p.units}</td>
                      <td className="p-2">{money(p.revenue)}</td>
                      <td className="p-2">{p.stock}</td>
                      <td className="p-2">{p.coverDays === null ? na : p.coverDays.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {tab === 3 && (
        <section className={box}>
          <h2 className="mb-3 font-serif text-xl">
            {l("Prioritised next steps", "Priorisierte nächste Schritte")}
          </h2>
          {recommendations(plan, loaded.sales, loaded.stock, loaded.today, de).length === 0 ? (
            <p className="text-white/65">
              {l(
                "No data-supported issue identified yet. Save meaningful targets and review completed periods. Missing traffic or costs cannot support a diagnosis.",
                "Noch kein datengestütztes Problem erkannt. Aussagekräftige Ziele speichern und abgeschlossene Zeiträume prüfen. Fehlende Traffic- oder Kostendaten erlauben keine Diagnose.",
              )}
            </p>
          ) : (
            recommendations(plan, loaded.sales, loaded.stock, loaded.today, de).map((rec, i) => (
              <article className="mt-4 rounded-xl border border-gold/20 p-4" key={rec.issue}>
                <h3 className="text-gold">
                  {i + 1}. {rec.issue}
                </h3>
                <p className="mt-3">{rec.action}</p>
                <p className="mt-3 text-sm text-white/65">
                  {l("Measure:", "Messung:")} {rec.measure}
                </p>
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}
