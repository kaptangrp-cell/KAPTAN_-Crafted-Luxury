import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("tax reviews conserve cash, version corrections, enforce roles and periods, and exclude owner funds from draft profit", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    staff = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}'),('${staff}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);`,
    );
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261015120000_finance_reports.sql",
      "20261015140000_finance_banking.sql",
      "20261015170000_finance_tax_review.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async (id = owner) =>
      db.exec(`RESET ROLE;SELECT set_config('app.user','${id}',false);SET ROLE authenticated;`);
    await login();
    await db.query("SELECT finance_set_member($1,'staff')", [staff]);
    const d = (
      await db.query("SELECT finance_document_reserve($1,'evidence.pdf','application/pdf',100) d", [
        "b".repeat(64),
      ])
    ).rows[0].d;
    await db.exec("RESET ROLE;SET ROLE service_role");
    await db.query("SELECT finance_document_finish($1,$2)", [d.id, owner]);
    await login();
    const post = async (a, b, n) => {
      const j = (
        await db.query("SELECT finance_submit($1,'2026-10-15','Test transaction',$2,$3) id", [
          randomUUID(),
          { reference: d.id },
          [
            { account: a, debit: n, credit: "0" },
            { account: b, debit: "0", credit: n },
          ],
        ])
      ).rows[0].id;
      await db.query("SELECT finance_post($1)", [j]);
      return j;
    };
    const receipt = await post("CLEARING", "ADVANCES", "10000"),
      capital = await post("BANK", "CAPITAL", "20000"),
      expense = await post("EXPENSE", "BANK", "1000");
    const review = async (j, alloc, id = randomUUID(), replace = null) =>
      db.query(
        "SELECT finance_tax_review($1,$2,'2026-10-15',$3,'Original payment and tax classification reviewed',$4,$5) id",
        [id, j, d.id, alloc, replace],
      );
    const first = randomUUID(),
      rows = [{ category: "receipts", amount: "10000", turnover: "10000" }];
    await login(staff);
    await assert.rejects(review(receipt, rows), /Forbidden/);
    await login();
    await assert.rejects(
      review(receipt, [{ category: "receipts", amount: "10001", turnover: "10001" }]),
      /must equal/,
    );
    await assert.rejects(
      review(receipt, [{ category: "excluded", amount: "10000", turnover: "1" }]),
      /Turnover/,
    );
    await review(receipt, rows, first);
    await review(receipt, rows, first);
    await assert.rejects(review(receipt, rows), /duplicate key/);
    await review(capital, [{ category: "excluded", amount: "20000", turnover: "0" }]);
    await review(expense, [{ category: "operating", amount: "-1000", turnover: "0" }]);
    let data = (await db.query("SELECT finance_tax_list(2026,0) r")).rows[0].r;
    assert.equal(data.turnover, "10000");
    assert.equal(data.unreviewed, "0");
    assert.equal(data.rules.currentLimit, "2500000");
    assert.equal(
      data.totals
        .filter((t) => !["excluded", "asset"].includes(t.category))
        .reduce((n, t) => n + BigInt(t.amount), 0n),
      9000n,
    );
    const replacement = randomUUID();
    await review(
      receipt,
      [{ category: "receipts", amount: "10000", turnover: "9000" }],
      replacement,
      first,
    );
    assert.equal((await db.query("SELECT finance_tax_list(2026,0) r")).rows[0].r.turnover, "9000");
    await assert.rejects(review(receipt, rows, randomUUID(), first), /current review/);
    await db.query("SELECT finance_set_period('2026-10-01',true,'Year review')");
    await assert.rejects(review(receipt, rows, randomUUID(), replacement), /closed/);
    await db.exec("RESET ROLE");
    await assert.rejects(db.query("DELETE FROM finance_tax_reviews"), /cannot be deleted/);
    await db.exec("SET ROLE anon");
    await assert.rejects(db.query("SELECT finance_tax_list(2026,0)"), /permission denied/);
  } finally {
    await db.close();
  }
});
