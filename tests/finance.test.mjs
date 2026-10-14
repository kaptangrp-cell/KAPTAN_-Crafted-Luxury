import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cents, euros, allocate } from "../src/lib/finance/money.ts";

test("finance uses exact cents and conserves all allocated costs", () => {
  assert.equal(cents("1234567890,19"), "123456789019");
  assert.equal(euros("123456789019"), "1.234.567.890,19 €");
  assert.throws(() => cents("1.001"));
  assert.deepEqual(allocate("100", ["1", "1", "1"]), ["34", "33", "33"]);
  assert.deepEqual(allocate("1", ["0", "1"]), ["0", "1"]);
  for (let n = 0; n < 100; n++)
    assert.equal(
      allocate(String(n), ["3", "7", "11"]).reduce((a, b) => a + BigInt(b), 0n),
      BigInt(n),
    );
});

test("finance database enforces roles, idempotency, balance, immutability, reversals and period locks", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-0000-0000-000000000001",
    accountant = "00000000-0000-0000-0000-000000000002",
    staff = "00000000-0000-0000-0000-000000000003",
    auditor = "00000000-0000-0000-0000-000000000004",
    customer = "00000000-0000-0000-0000-000000000005";
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.user',true),'')::uuid $$; CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid()='${owner}'::uuid $$; INSERT INTO auth.users VALUES('${owner}'),('${accountant}'),('${staff}'),('${auditor}'),('${customer}');`,
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261015100000_finance_foundation.sql", import.meta.url),
        "utf8",
      ),
    );
    const login = async (id) =>
      db.exec(`RESET ROLE; SELECT set_config('app.user','${id}',false); SET ROLE authenticated;`);
    await login(owner);
    for (const [id, role] of [
      [accountant, "accountant"],
      [staff, "staff"],
      [auditor, "auditor"],
    ])
      await db.query("SELECT finance_set_member($1,$2)", [id, role]);
    const lines = [
      { account: "BANK", debit: "10000", credit: "0" },
      { account: "CAPITAL", debit: "0", credit: "10000" },
    ];
    const submit = async (key = "owner-capital", ls = lines) =>
      (
        await db.query("SELECT finance_submit($1,'2026-10-15','Owner capital',$2,$3) id", [
          key,
          { reference: "bank-statement-1" },
          ls,
        ])
      ).rows[0].id;
    const id = await submit();
    assert.equal(await submit(), id);
    await assert.rejects(
      submit("owner-capital", [{ ...lines[0], debit: "10001" }, lines[1]]),
      /different content/,
    );
    await assert.rejects(submit("bad", [{ ...lines[0], debit: "9999" }, lines[1]]), /balance/);
    await assert.rejects(
      submit("fraction", [{ ...lines[0], debit: "1.5" }, lines[1]]),
      /integer cents/,
    );
    await assert.rejects(
      db.query("UPDATE finance_journals SET memo='tamper' WHERE id=$1", [id]),
      /permission denied/,
    );
    await db.query("SELECT finance_post($1)", [id]);
    await db.query("SELECT finance_post($1)", [id]);
    let snapshot = (await db.query("SELECT finance_snapshot('2026-01-01','2026-12-31') data"))
      .rows[0].data;
    assert.equal(snapshot.trial.find((x) => x.account === "BANK").debit, "10000");
    assert.equal(snapshot.audit.filter((x) => x.event === "posted").length, 1);
    await db.exec("RESET ROLE");
    await assert.rejects(
      db.query("UPDATE finance_journals SET memo='tamper' WHERE id=$1", [id]),
      /immutable/,
    );
    await assert.rejects(
      db.query("DELETE FROM finance_lines WHERE journal_id=$1", [id]),
      /immutable/,
    );
    await assert.rejects(db.exec("DELETE FROM finance_audit"), /append-only/);
    await login(staff);
    const draft = await submit("staff-draft");
    await assert.rejects(db.query("SELECT finance_post($1)", [draft]), /Forbidden/);
    await assert.rejects(
      db.query("SELECT finance_set_member($1,$2)", [customer, "accountant"]),
      /Forbidden/,
    );
    await login(auditor);
    await assert.rejects(submit("auditor"), /Forbidden/);
    await login(customer);
    assert.equal((await db.query("SELECT * FROM finance_journals")).rows.length, 0);
    await assert.rejects(
      db.query("SELECT finance_snapshot('2026-01-01','2026-12-31')"),
      /Forbidden/,
    );
    await login(accountant);
    await db.query("SELECT finance_set_period('2026-10-01',true,'Month reviewed')");
    await assert.rejects(db.query("SELECT finance_post($1)", [draft]), /closed/);
    await assert.rejects(
      db.query("SELECT finance_set_period('2026-10-01',false,'Correction needed')"),
      /Forbidden/,
    );
    await login(owner);
    await db.query("SELECT finance_set_period('2026-10-01',false,'Correction needed')");
    const reversal = (
      await db.query("SELECT finance_reverse($1,'2026-10-16','Test correction') id", [id])
    ).rows[0].id;
    assert.equal(
      (await db.query("SELECT finance_reverse($1,'2026-10-16','Test correction') id", [id])).rows[0]
        .id,
      reversal,
    );
    snapshot = (await db.query("SELECT finance_snapshot('2026-01-01','2026-12-31') data")).rows[0]
      .data;
    for (const row of snapshot.trial) assert.equal(row.debit, row.credit);
    await db.query("SELECT finance_set_member($1,NULL)", [auditor]);
    await login(auditor);
    assert.equal((await db.query("SELECT * FROM finance_journals")).rows.length, 0);
    await db.exec("RESET ROLE");
    await assert.rejects(
      db.exec(`BEGIN;
      INSERT INTO finance_journals(external_key,booking_date,period,memo,source,created_by,status,posted_by,posted_at)
      VALUES('invalid-direct-post','2026-10-15','2026-10-01','Missing lines','{"reference":"test"}','${owner}','posted','${owner}',now());
      COMMIT;`),
      /balance/,
    );
    await db.exec("ROLLBACK");
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.exec("SELECT * FROM finance_journals"), /permission denied/);
    await assert.rejects(db.exec("SELECT finance_role()"), /permission denied/);
  } finally {
    await db.close();
  }
});
