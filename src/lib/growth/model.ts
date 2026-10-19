import { z } from "zod";
const amount = z.number().finite().min(0).max(100000000);
const count = amount.int();
export const MetricsSchema = z.object({
  revenue: amount,
  orders: count,
  margin: z.number().min(0).max(100),
  budget: amount,
  customers: count,
  traffic: count,
  social: count,
});
export const ReviewSchema = z.object({
  spend: amount.nullable(),
  traffic: count.nullable(),
  social: count.nullable(),
  note: z.string().max(1000),
});
export const ScenarioSchema = z.object({
  dailyOrders: z.number().finite().min(0).max(100000).nullable(),
  aov: amount.nullable(),
  growth: z.number().min(-100).max(1000),
  note: z.string().max(1000),
});
export const PlanSchema = z
  .object({
    period: z.enum(["60days", "2027"]),
    start: z.string().date(),
    targets: MetricsSchema,
    buckets: z
      .array(
        z.object({
          start: z.string().date(),
          end: z.string().date(),
          targets: MetricsSchema,
          review: ReviewSchema,
        }),
      )
      .min(9)
      .max(12),
    scenarios: z.object({
      conservative: ScenarioSchema,
      expected: ScenarioSchema,
      optimistic: ScenarioSchema,
    }),
  })
  .superRefine((p, ctx) => {
    const expected = makeBuckets(p.period, p.start);
    if (p.period === "2027" && p.start !== "2027-01-01")
      ctx.addIssue({ code: "custom", message: "2027 starts on 1 January" });
    if (
      JSON.stringify(p.buckets.map((b) => [b.start, b.end])) !==
      JSON.stringify(expected.map((b) => [b.start, b.end]))
    )
      ctx.addIssue({ code: "custom", message: "Invalid planning periods" });
    for (const key of ["revenue", "orders", "budget", "customers", "traffic", "social"] as const) {
      if (Math.abs(p.buckets.reduce((s, b) => s + b.targets[key], 0) - p.targets[key]) > 0.011)
        ctx.addIssue({ code: "custom", message: `Period ${key} must add up to total target` });
    }
  });
export type Metrics = z.infer<typeof MetricsSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Bucket = Plan["buckets"][number];
export const ActionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  steps: z.string().trim().min(3).max(2000),
  benefit: z.string().trim().min(3).max(1000),
  budget: amount,
  deadline: z.string().date(),
  kpi: z.string().trim().min(3).max(500),
  status: z.enum(["todo", "progress", "done"]),
});
export type Action = z.infer<typeof ActionSchema>;
export const emptyMetrics = (): Metrics => ({
  revenue: 0,
  orders: 0,
  margin: 0,
  budget: 0,
  customers: 0,
  traffic: 0,
  social: 0,
});
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
export const daysBetween = (start: string, end: string) =>
  Math.round((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000);
export function berlinDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function makeBuckets(period: Plan["period"], start: string): Bucket[] {
  return Array.from({ length: period === "2027" ? 12 : 9 }, (_, i) => {
    const from =
      period === "2027" ? `2027-${String(i + 1).padStart(2, "0")}-01` : addDays(start, i * 7);
    const end =
      period === "2027"
        ? i === 11
          ? "2028-01-01"
          : `2027-${String(i + 2).padStart(2, "0")}-01`
        : addDays(start, Math.min((i + 1) * 7, 60));
    return {
      start: from,
      end,
      targets: emptyMetrics(),
      review: { spend: null, traffic: null, social: null, note: "" },
    };
  });
}
export function newPlan(period: Plan["period"], today: string): Plan {
  const start = period === "2027" ? "2027-01-01" : today;
  const scenario = () => ({ dailyOrders: null, aov: null, growth: 0, note: "" });
  return {
    period,
    start,
    targets: emptyMetrics(),
    buckets: makeBuckets(period, start),
    scenarios: { conservative: scenario(), expected: scenario(), optimistic: scenario() },
  };
}
/** Allocate by days, with integer remainder preserved. Never silently overwrite saved custom allocations. */
export function allocate(plan: Plan): Plan {
  const totalDays = daysBetween(plan.start, plan.buckets.at(-1)!.end);
  const buckets = plan.buckets.map((b) => ({
    ...b,
    targets: { ...b.targets, margin: plan.targets.margin },
  }));
  for (const key of ["revenue", "orders", "budget", "customers", "traffic", "social"] as const) {
    const scale = ["revenue", "budget"].includes(key) ? 100 : 1;
    const total = Math.round(plan.targets[key] * scale);
    let assigned = 0;
    buckets.forEach((b, i) => {
      const cumulative = Math.round((total * daysBetween(plan.start, b.end)) / totalDays);
      const value = i === buckets.length - 1 ? total - assigned : cumulative - assigned;
      b.targets[key] = value / scale;
      assigned += value;
    });
  }
  return { ...plan, buckets };
}
export type Sale = {
  id: string;
  day: string;
  total: number;
  discount: number;
  status: string;
  payment: string;
  newCustomer: boolean;
  items: {
    productId: string;
    name: string;
    quantity: number;
    total: number;
    cost: number | null;
  }[];
};
export type Stock = {
  id: string;
  name: string;
  category: string;
  stock: number;
  price: number;
  active: boolean;
};
export type Actual = {
  revenue: number | null;
  orders: number;
  profit: number | null;
  customers: number;
  aov: number | null;
  excluded: number;
  missingCosts: number;
};
const eligible = (s: Sale) => s.payment === "paid" && s.status !== "cancelled";
export function actuals(sales: Sale[], start: string, end: string): Actual {
  const window = sales.filter((s) => s.day >= start && s.day < end);
  const paid = window.filter(eligible);
  const uncertain = window.some((s) => s.payment === "partially_refunded");
  let missingCosts = 0,
    profit = 0;
  for (const s of paid) {
    if (!s.items.length) missingCosts++;
    for (const i of s.items) {
      if (i.cost === null) missingCosts++;
      else profit += i.total - i.cost * i.quantity;
    }
    profit -= s.discount;
  }
  const revenue = uncertain ? null : Math.round(paid.reduce((a, s) => a + s.total, 0) * 100) / 100;
  return {
    revenue,
    orders: paid.length,
    profit: uncertain || missingCosts ? null : Math.round(profit * 100) / 100,
    customers: paid.filter((s) => s.newCustomer).length,
    aov: revenue !== null && paid.length ? revenue / paid.length : null,
    excluded: window.length - paid.length,
    missingCosts,
  };
}
export const changePercent = (actual: number | null, target: number | null) =>
  actual === null || target === null || target === 0 ? null : ((actual - target) / target) * 100;
export function report(plan: Plan, sales: Sale[], stock: Stock[], today: string) {
  const end = plan.buckets.at(-1)!.end;
  const through = addDays(today, 1);
  const elapsedEnd = through < end ? through : end;
  const total = actuals(sales, plan.start, elapsedEnd);
  const remainingDays = Math.max(0, daysBetween(through > plan.start ? through : plan.start, end));
  const elapsedDays = Math.max(0, daysBetween(plan.start, elapsedEnd));
  const previous = actuals(sales, addDays(plan.start, -elapsedDays), plan.start);
  // Exclude the incomplete current day; use a fixed 28-day window.
  const history = actuals(sales, addDays(today, -28), today);
  const firstSale = sales
    .filter(eligible)
    .map((s) => s.day)
    .sort()[0];
  const sufficient = Boolean(
    firstSale &&
    firstSale <= addDays(today, -28) &&
    history.orders >= 5 &&
    history.revenue !== null,
  );
  const forecasts = Object.entries(plan.scenarios).map(([name, s]) => {
    const daily = s.dailyOrders ?? (sufficient ? history.orders / 28 : null);
    const aov = s.aov ?? (sufficient ? history.aov : null);
    const manual = s.dailyOrders !== null || s.aov !== null || s.growth !== 0;
    const future =
      daily === null || aov === null ? null : daily * aov * (1 + s.growth / 100) * remainingDays;
    return {
      name,
      manual,
      orders:
        remainingDays === 0
          ? total.orders
          : daily === null
            ? null
            : total.orders + daily * (1 + s.growth / 100) * remainingDays,
      daily,
      aov,
      revenue:
        total.revenue === null
          ? null
          : remainingDays === 0
            ? total.revenue
            : future === null
              ? null
              : total.revenue + future,
    };
  });
  const remaining =
    total.revenue === null ? null : Math.max(0, plan.targets.revenue - total.revenue);
  const periods = plan.buckets.map((b, i) => ({
    ...b,
    actual: b.start > today ? null : actuals(sales, b.start, b.end < through ? b.end : through),
    previous: actuals(
      sales,
      i ? plan.buckets[i - 1].start : addDays(b.start, -daysBetween(b.start, b.end)),
      b.start,
    ),
    partial: b.start <= today && b.end > through,
  }));
  const products = stock
    .filter((p) => p.active)
    .map((p) => {
      const sold = sales
        .filter((s) => eligible(s) && s.day >= plan.start && s.day < elapsedEnd)
        .flatMap((s) => s.items)
        .filter((i) => i.productId === p.id);
      const recent = sales
        .filter((s) => eligible(s) && s.day >= addDays(today, -28) && s.day < today)
        .flatMap((s) => s.items)
        .filter((i) => i.productId === p.id)
        .reduce((sum, i) => sum + i.quantity, 0);
      return {
        ...p,
        units: sold.reduce((sum, i) => sum + i.quantity, 0),
        revenue: sold.reduce((sum, i) => sum + i.total, 0),
        coverDays: recent > 0 ? p.stock / (recent / 28) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  return {
    total,
    previous,
    history,
    sufficient,
    remainingDays,
    forecasts,
    remaining,
    achievement:
      total.revenue !== null && plan.targets.revenue > 0
        ? (total.revenue / plan.targets.revenue) * 100
        : null,
    requiredPerDay: remainingDays && remaining !== null ? remaining / remainingDays : null,
    remainingPeriods: plan.buckets.filter((b) => b.end > through).length,
    periods,
    products,
  };
}
export type Recommendation = { issue: string; action: string; measure: string };
export function recommendations(
  plan: Plan,
  sales: Sale[],
  stock: Stock[],
  today: string,
  de = false,
): Recommendation[] {
  const r = report(plan, sales, stock, today);
  const result: Recommendation[] = [];
  const low = r.products.find((p) => p.coverDays !== null && p.coverDays < 14);
  if (low)
    result.push({
      issue: de
        ? `${low.name}: Bestand reicht bei der Verkaufsrate der letzten 28 Tage für etwa ${Math.floor(low.coverDays!)} Tage.`
        : `${low.name}: stock covers about ${Math.floor(low.coverDays!)} days at the last 28-day sales rate.`,
      action: de
        ? "Lieferzeit und verfügbaren Variantenbestand prüfen, dann Nachbestellung planen."
        : "Check supplier lead time and variant availability, then plan replenishment.",
      measure: de
        ? "Bestandsreichweite und Tage ohne Bestand wöchentlich prüfen."
        : "Review stock coverage and out-of-stock days weekly.",
    });
  const completed = r.periods.filter((b) => b.end <= today && b.actual);
  const last = completed.at(-1);
  if (last && last.actual!.revenue !== null && last.actual!.revenue < last.targets.revenue)
    result.push({
      issue: de
        ? `${last.start}: Umsatz unter dem gespeicherten Periodenziel.`
        : `${last.start}: revenue is below the saved period target.`,
      action: de
        ? "Hypothese: Produktseiten oder Angebot bremsen Verkäufe. Die meistverkauften verfügbaren Produkte prüfen und eine Änderung pro Woche testen."
        : "Hypothesis: product pages or the offer may be limiting sales. Review the best-selling available products and test one change per week.",
      measure: de
        ? "Bezahlte Bestellungen und Umsatz mit der Vorwoche vergleichen; keine Kausalität unterstellen."
        : "Compare paid orders and revenue with the previous week; do not assume causation.",
    });
  if (last && last.review.traffic !== null && last.targets.traffic > last.review.traffic)
    result.push({
      issue: de
        ? "Manuell erfasster Traffic liegt unter dem Ziel."
        : "Manually recorded traffic is below target.",
      action: de
        ? "SEO-Titel und Inhalte der verfügbaren Kategorie prüfen; einen Beitrag mit eindeutigem Shop-Link veröffentlichen."
        : "Review SEO titles and content for an available category; publish a post with a distinct shop link.",
      measure: de
        ? "Traffic aus derselben Quelle im nächsten Zeitraum erfassen."
        : "Record traffic from the same source next period.",
    });
  if (
    last &&
    last.actual!.profit !== null &&
    last.actual!.revenue &&
    (last.actual!.profit / last.actual!.revenue) * 100 < last.targets.margin
  )
    result.push({
      issue: de
        ? "Geschätzte Produktmarge liegt unter dem Ziel."
        : "Estimated product margin is below target.",
      action: de
        ? "Aktuelle Produktkosten und Rabatte der verkauften Artikel prüfen, bevor weitere Rabatte angeboten werden."
        : "Check current product costs and discounts for sold items before offering further discounts.",
      measure: de
        ? "Produktmarge und Kostenvollständigkeit im nächsten Zeitraum prüfen."
        : "Review product margin and cost completeness next period.",
    });
  return result.slice(0, 3);
}
/** Deterministic proposals derived from the actual catalogue and saved goal; benefits are hypotheses. */
export function suggestActions(plan: Plan, stock: Stock[], de = false): Action[] {
  const available = stock.filter((p) => p.active && p.stock > 0).sort((a, b) => b.stock - a.stock);
  if (!available.length) return [];
  return plan.buckets.map((b, i) => {
    const p = available[i % available.length];
    const category = p.category || p.name;
    const paid = b.targets.budget > 0 && i % 3 === 1;
    const seasonal = plan.period === "2027" && i >= 9;
    return {
      title: paid
        ? de
          ? `Kleinen Werbetest für ${category} planen`
          : `Plan a small advertising test for ${category}`
        : seasonal
          ? de
            ? `Firmengeschenke mit ${p.name} vorbereiten`
            : `Prepare corporate gifting with ${p.name}`
          : de
            ? `${p.name}: Produktseite und Instagram-Beitrag verbessern`
            : `Improve ${p.name} page and Instagram content`,
      steps: de
        ? `Bestand (${p.stock}) und Varianten vor Start prüfen. ${paid ? "Zielgruppe und Ausgabenlimit festlegen; nach halbem Budget Ergebnisse prüfen und bei ausbleibenden Bestellungen stoppen." : seasonal ? "Passendes Geschenkangebot mit Lieferfrist kalkulieren und bei bestehenden Geschäftskontakten bzw. lokalen Partnern vorstellen; keine unerlaubte Werbeansprache." : "Bilder, deutsche/englische Beschreibung und Nutzen prüfen. Ein Reel zur Anwendung erstellen und auf die Produktseite verlinken."} Periodenziel: ${b.targets.orders} Bestellungen und ${b.targets.customers} neue Käufer. Keine E-Mail-Kampagne ohne nachgewiesene Einwilligung.`
        : `Check stock (${p.stock}) and variants before launch. ${paid ? "Set audience and spending cap; review at half the budget and stop if orders do not materialise." : seasonal ? "Cost a gift offer with a delivery deadline; discuss with existing business contacts or local partners, without unsolicited marketing." : "Review images, German/English copy and benefits. Create a usage Reel linking to the product page."} Period goal: ${b.targets.orders} orders and ${b.targets.customers} new buyers. Do not email without evidenced consent.`,
      benefit: de
        ? `Hypothese: Bessere Sichtbarkeit von ${category} könnte qualifizierte Besuche und Käufe erhöhen. Keine garantierte Wirkung.`
        : `Hypothesis: better visibility for ${category} may increase qualified visits and purchases. No guaranteed outcome.`,
      budget: paid ? Math.round(b.targets.budget * 100) / 100 : 0,
      deadline: addDays(b.end, -1),
      kpi: de
        ? `Bestellungen gegenüber Periodenziel ${b.targets.orders}; Ausgaben höchstens ${b.targets.budget} EUR; Link-Klicks nur bei verfügbarer Messung.`
        : `Orders versus period target ${b.targets.orders}; spend no more than EUR ${b.targets.budget}; link clicks only where measurement exists.`,
      status: "todo",
    };
  });
}
