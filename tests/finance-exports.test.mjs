import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { journalCsv, accountantWorkbook } from "../src/lib/finance/exports.ts";
import * as XLSX from "xlsx";
test("accountant exports preserve exact cents, draft status, source links and safe spreadsheet text", async () => {
  const db = new PGlite(),
    owner = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;`,
    );
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015120000_finance_reports.sql",
      "20261015180000_finance_exports.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    await db.exec(`SELECT set_config('app.user','${owner}',false);SET ROLE authenticated;`);
    await db.query("SELECT finance_submit($1,'2026-10-15','=HYPERLINK(untrusted)',$2,$3)", [
      randomUUID(),
      { reference: "source-id" },
      [
        { account: "BANK", debit: "9000000000000", credit: "0" },
        { account: "CAPITAL", debit: "0", credit: "9000000000000" },
      ],
    ]);
    const d = (await db.query("SELECT finance_export('2026-01-01','2026-12-31') r")).rows[0].r;
    assert.equal(d.lines.length, 2);
    assert.equal(d.report.postedCount, "0");
    assert.equal(d.report.draftCount, "1");
    assert.equal(d.lines[0].status, "draft");
    assert.match(journalCsv(d), /"'=HYPERLINK/);
    assert.match(d.lines[0].source, /source-id/);
    const bytes = await accountantWorkbook(d),
      book = XLSX.read(bytes, { type: "array" });
    const row = book.Sheets.Journals;
    assert.equal(row.E2.t, "s");
    assert.equal(row.E2.f, undefined);
    assert.equal(row.G2.v, "9000000000000");
    assert.equal(row.G2.t, "s");
    assert.equal(book.SheetNames.length, 3);
    await db.exec("RESET ROLE;SET ROLE anon");
    await assert.rejects(
      db.query("SELECT finance_export('2026-01-01','2026-12-31')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
