import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { ReportSchema, summarizeReport, reportCsv } from "../src/lib/finance/reports.ts";
test("reports reconcile one ledger, opening balances, owner capital, profit, transfers and cash", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-0000-0000-000000000001";
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${owner}'::uuid$$; CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;`,
    );
    for (const name of [
      "20261015100000_finance_foundation.sql",
      "20261015120000_finance_reports.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"),
      );
    await db.exec("SET ROLE authenticated");
    async function post(key, date, debit, credit, amount, posted = true) {
      const id = (
        await db.query("SELECT finance_submit($1,$2,$3,$4,$5) id", [
          key,
          date,
          key,
          { reference: key },
          [
            { account: debit, debit: amount, credit: "0" },
            { account: credit, debit: "0", credit: amount },
          ],
        ])
      ).rows[0].id;
      if (posted) await db.query("SELECT finance_post($1)", [id]);
    }
    await post("opening capital", "2026-09-01", "BANK", "CAPITAL", "100000");
    await post("cash sale", "2026-10-01", "BANK", "SALES", "20000");
    await post("office expense", "2026-10-02", "EXPENSE", "BANK", "5000");
    await post("owner drawing", "2026-10-03", "DRAWINGS", "BANK", "10000");
    await post("cash transfer", "2026-10-04", "CASH", "BANK", "7000");
    await post("unposted sale", "2026-10-05", "AR", "SALES", "90000", false);
    await post("future sale", "2026-11-01", "BANK", "SALES", "99999");
    const report = ReportSchema.parse(
      (await db.query("SELECT finance_report('2026-10-01','2026-10-31') d")).rows[0].d,
    );
    const s = summarizeReport(report);
    assert.equal(s.revenue, "20000");
    assert.equal(s.expenses, "5000");
    assert.equal(s.profit, "15000");
    assert.equal(s.cashOpening, "100000");
    assert.equal(s.cashClosing, "105000");
    assert.equal(s.bank, "98000");
    assert.equal(report.cash.inflow, "20000");
    assert.equal(report.cash.outflow, "15000");
    assert.equal(s.balanceGap, "0");
    assert.equal(s.cashGap, "0");
    assert.equal(s.equity, "105000");
    assert.equal(report.draftCount, "1");
    report.accounts[0].name_en = '=HYPERLINK("bad")';
    assert.match(reportCsv(report, false), /"'=HYPERLINK/);
    await db.exec(
      `RESET ROLE; INSERT INTO finance_audit(actor,event,reference) SELECT '${owner}','ordering_test',n::text FROM generate_series(1,105) n; SET ROLE authenticated;`,
    );
    const audit = (await db.query("SELECT finance_snapshot('2026-01-01','2026-12-31') d")).rows[0].d
      .audit;
    assert.equal(audit.length, 50);
    assert.equal(audit[0].reference, "105");
    assert.equal(audit[49].reference, "56");
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(
      db.exec("SELECT finance_report('2026-01-01','2026-12-31')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
