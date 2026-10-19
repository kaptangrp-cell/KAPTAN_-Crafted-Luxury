import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  newPlan,
  allocate,
  PlanSchema,
  ActionSchema,
  actuals,
  report,
  recommendations,
  suggestActions,
  berlinDay,
  changePercent,
  launchRequirements,
  nextMonth,
} from "../src/lib/growth/model.ts";
const sale = (id, day, extra = {}) => ({
  id,
  day,
  total: 100,
  discount: 0,
  payment: "paid",
  status: "delivered",
  newCustomer: true,
  items: [{ productId: "p", name: "Wallet", quantity: 1, total: 100, cost: 40 }],
  ...extra,
});
const stock = [
  { id: "p", name: "Wallet", category: "Leather", stock: 10, price: 100, active: true },
];
test("60 days and 2027 allocate exact totals including partial week and February", () => {
  for (const period of ["60days", "2027"]) {
    let p = newPlan(period, "2026-10-19");
    p.targets = {
      revenue: 12345.67,
      orders: 101,
      margin: 35,
      budget: 321.45,
      customers: 57,
      traffic: 1001,
      social: 9,
    };
    p = allocate(p);
    assert.equal(PlanSchema.safeParse(p).success, true);
    assert.equal(p.buckets.length, period === "60days" ? 9 : 12);
    for (const k of ["revenue", "orders", "budget", "customers", "traffic", "social"])
      assert.ok(Math.abs(p.buckets.reduce((s, b) => s + b.targets[k], 0) - p.targets[k]) < 0.001);
    if (period === "60days") assert.equal(p.buckets.at(-1).end, "2026-12-18");
    else assert.equal(p.buckets[1].end, "2027-03-01");
  }
});
test("form schemas reject invalid targets, inconsistent totals, dates and actions", () => {
  const p = newPlan("60days", "2026-10-19");
  assert.ok(PlanSchema.safeParse(p).success);
  assert.equal(
    PlanSchema.safeParse({ ...p, targets: { ...p.targets, orders: -1 } }).success,
    false,
  );
  assert.equal(
    PlanSchema.safeParse({ ...p, targets: { ...p.targets, revenue: 100 } }).success,
    false,
  );
  assert.equal(
    PlanSchema.safeParse({
      ...p,
      buckets: p.buckets.map((b, i) => (i ? b : { ...b, end: "2027-12-31" })),
    }).success,
    false,
  );
  assert.equal(
    ActionSchema.safeParse({
      title: "x",
      steps: "",
      benefit: "",
      budget: -1,
      deadline: "not-date",
      kpi: "",
      status: "invalid",
    }).success,
    false,
  );
});
test("actuals exclude unpaid and cancelled orders, preserve unknown costs and refunds", () => {
  const data = [
    sale("1", "2026-10-19"),
    sale("2", "2026-10-19", { payment: "pending" }),
    sale("3", "2026-10-19", { status: "cancelled" }),
    sale("4", "2026-10-19", { payment: "refunded" }),
  ];
  assert.deepEqual(actuals(data, "2026-10-19", "2026-10-20"), {
    revenue: 100,
    orders: 1,
    profit: 60,
    customers: 1,
    aov: 100,
    excluded: 3,
    missingCosts: 0,
  });
  const missing = sale("5", "2026-10-19", {
    items: [{ productId: "p", name: "Wallet", quantity: 1, total: 100, cost: null }],
  });
  assert.equal(actuals([missing], "2026-10-19", "2026-10-20").profit, null);
  assert.equal(
    actuals(
      [...data, sale("6", "2026-10-19", { payment: "partially_refunded" })],
      "2026-10-19",
      "2026-10-20",
    ).revenue,
    null,
  );
  assert.equal(changePercent(10, 0), null);
});
test("forecasts require history or explicit manual inputs, do not double count today", () => {
  const p = newPlan("60days", "2026-10-19");
  let r = report(p, [], stock, "2026-10-19");
  assert.equal(r.forecasts[0].revenue, null);
  assert.equal(r.remainingDays, 59);
  assert.equal(r.periods[1].actual, null);
  p.scenarios.expected = { dailyOrders: 2, aov: 50, growth: 10, note: "Manual test" };
  r = report(p, [sale("1", "2026-10-19")], stock, "2026-10-19");
  assert.equal(Math.round(r.forecasts[1].revenue), 6590);
  assert.equal(r.forecasts[1].manual, true);
  assert.equal(r.forecasts[0].revenue, null);
  const historic = Array.from({ length: 5 }, (_, i) => sale(String(i), `2026-09-${21 + i}`));
  r = report(p, historic, stock, "2026-10-19");
  assert.equal(r.sufficient, true);
  assert.ok(r.forecasts[0].revenue > 0);
  assert.equal(r.forecasts[0].revenue, r.forecasts[2].revenue);
  assert.equal(report(p, [], stock, "2027-01-01").forecasts[0].revenue, 0);
});
test("recommendations need evidence and proposals respect inventory, targets and budgets", () => {
  let p = newPlan("60days", "2026-10-19");
  assert.deepEqual(recommendations(p, [], stock, "2026-10-19"), []);
  assert.ok(suggestActions(p, [{ ...stock[0], stock: 0 }]).every((a) => a.budget === 0));
  p.targets = { ...p.targets, revenue: 6000, orders: 60, budget: 300 };
  p = allocate(p);
  const actions = suggestActions(p, stock);
  assert.equal(actions.length, 18);
  assert.ok(actions.every((a) => a.title.includes("Wallet")));
  assert.ok(actions.every((a) => ActionSchema.safeParse(a).success));
  assert.ok(actions.reduce((s, a) => s + a.budget, 0) <= 300);
  assert.ok(actions.every((a) => a.benefit.includes("Hypothesis")));
  const rec = recommendations(p, [], stock, "2026-10-27");
  assert.equal(rec.length, 1);
  assert.match(rec[0].issue, /below/);
  assert.ok(rec.length <= 3);
});
test("Berlin calendar date handles midnight and daylight-saving boundaries", () => {
  assert.equal(berlinDay(new Date("2026-10-18T23:30:00Z")), "2026-10-19");
  assert.equal(berlinDay(new Date("2027-03-28T22:30:00Z")), "2027-03-29");
});
test("database enforces admin access and optimistic revisions without changing store tables", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='00000000-0000-4000-8000-000000000001'::uuid$$;`,
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261019090000_growth_planner.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261019100000_growth_startup_year.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`INSERT INTO growth_plans(period,data) VALUES('firstyear','{}')`);
    await db.exec(
      `SET ROLE authenticated;SELECT set_config('app.uid','00000000-0000-4000-8000-000000000002',false)`,
    );
    assert.equal((await db.query("SELECT * FROM growth_plans")).rows.length, 0);
    await assert.rejects(
      db.exec(`INSERT INTO growth_plans(period,data) VALUES('60days','{}')`),
      /row-level security/,
    );
    await db.exec(`SELECT set_config('app.uid','00000000-0000-4000-8000-000000000001',false)`);
    const row = (
      await db.query(
        `INSERT INTO growth_plans(period,data) VALUES('60days','{}') RETURNING id,revision`,
      )
    ).rows[0];
    assert.equal(row.revision, 1);
    assert.equal(
      (
        await db.query(
          `UPDATE growth_plans SET data='{"test":true}' WHERE id=$1 AND revision=1 RETURNING revision`,
          [row.id],
        )
      ).rows[0].revision,
      2,
    );
    assert.equal(
      (
        await db.query(
          `UPDATE growth_plans SET data='{}' WHERE id=$1 AND revision=1 RETURNING id`,
          [row.id],
        )
      ).rows.length,
      0,
    );
    const action = (
      await db.query(`INSERT INTO growth_actions(plan_id,data) VALUES($1,'{}') RETURNING id`, [
        row.id,
      ])
    ).rows[0];
    await db.exec(`SELECT set_config('app.uid','00000000-0000-4000-8000-000000000002',false)`);
    assert.equal((await db.query("SELECT * FROM growth_actions")).rows.length, 0);
    assert.equal(
      (await db.query("DELETE FROM growth_actions WHERE id=$1 RETURNING id", [action.id])).rows
        .length,
      0,
    );
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.exec("SELECT * FROM growth_plans"), /permission denied/);
  } finally {
    await db.close();
  }
});

test("startup roadmap works before sales, catalogue or budget; both languages and horizons", () => {
  for (const period of ["60days", "firstyear", "2027"]) {
    let p = newPlan(period, "2026-11-01");
    for (const de of [false, true]) {
      const actions = suggestActions(p, [], de);
      assert.equal(actions.length, period === "60days" ? 18 : 24);
      assert.ok(actions.every((a) => ActionSchema.safeParse(a).success));
      assert.ok(
        actions.every(
          (a) => a.budget === 0 && a.deadline >= p.start && a.deadline < p.buckets.at(-1).end,
        ),
      );
      assert.ok(
        actions.every(
          (a) =>
            a.steps.includes(de ? "Vorbereitung" : "Pre-launch") ||
            a.steps.includes(de ? "Entwürfe" : "drafts"),
        ),
      );
    }
    p = allocate({ ...p, targets: { ...p.targets, revenue: 10000, orders: 100, budget: 1000 } });
    const withStock = suggestActions(p, stock);
    const withoutStock = suggestActions(p, [{ ...stock[0], stock: 0 }]);
    assert.ok(withStock.some((a) => a.budget > 0));
    assert.ok(withStock.reduce((sum, a) => sum + a.budget, 0) <= p.targets.budget);
    assert.ok(withoutStock.every((a) => a.budget === 0));
    assert.ok(PlanSchema.safeParse(p).success);
  }
});
test("rolling first year and next-month launch handle year boundaries and month ends", () => {
  assert.equal(nextMonth("2026-10-19"), "2026-11-01");
  assert.equal(nextMonth("2026-12-31"), "2027-01-01");
  const p = newPlan("firstyear", "2026-11-01");
  assert.equal(p.buckets.at(-1).end, "2027-11-01");
  const endMonth = newPlan("firstyear", "2027-01-31");
  assert.equal(endMonth.buckets[1].start, "2027-02-28");
  assert.equal(endMonth.buckets[2].start, "2027-03-31");
  assert.ok(PlanSchema.safeParse(endMonth).success);
  const legacy = newPlan("2027", "2026-10-19");
  delete legacy.launch;
  assert.deepEqual(PlanSchema.parse(legacy).launch, {
    productId: "",
    audience: "",
    aov: null,
    conversion: null,
  });
});
test("startup feasibility never invents a conversion rate or mixes targets into actuals", () => {
  const p = newPlan("firstyear", "2026-11-01");
  p.targets.revenue = 6000;
  assert.deepEqual(launchRequirements(p), { orders: null, visits: null, revenue: null });
  p.launch = { ...p.launch, aov: 60, conversion: 2 };
  assert.deepEqual(launchRequirements(p), { orders: 100, visits: 5000, revenue: 6000 });
  assert.equal(report(allocate(p), [], [], "2026-10-19").forecasts[0].revenue, null);
  p.targets.orders = 50;
  assert.deepEqual(launchRequirements(p), { orders: 50, visits: 2500, revenue: 3000 });
});
