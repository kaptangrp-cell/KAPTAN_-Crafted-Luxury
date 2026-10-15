import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("invoice inbox captures once, imports verified advances once, retains failures and never doubles final invoices", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    staff = randomUUID();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}'),('${staff}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$; CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;
 CREATE TABLE public.orders(id uuid PRIMARY KEY,total numeric,payment_status text); CREATE TABLE public.order_checkouts(order_id uuid,state text,provider_id text,provider_kind text);
 CREATE TABLE public.invoices(id uuid PRIMARY KEY,order_id uuid REFERENCES orders(id),number text,kind text,state text,model jsonb,source jsonb,pdf_base64 text);`);
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015130000_finance_sales_inbox.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async (id = owner) =>
      db.exec(`RESET ROLE; SELECT set_config('app.user','${id}',false); SET ROLE authenticated;`);
    async function invoice(kind = "advance", paid = true, issued = true, gross = "11900") {
      await db.exec("RESET ROLE");
      const order = randomUUID(),
        id = randomUUID();
      await db.query("INSERT INTO orders VALUES($1,119,$2)", [order, paid ? "paid" : "pending"]);
      if (paid)
        await db.query(
          "INSERT INTO order_checkouts VALUES($1,'paid','provider-verified','stripe_checkout')",
          [order],
        );
      await db.query("INSERT INTO invoices VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [
        id,
        order,
        "KPT-" + id,
        kind,
        issued ? "issued" : "queued",
        { gross, rounding: 0, paidDate: "2026-10-15", taxMode: "kleinunternehmer" },
        { order: { tax_data: { currency: "EUR" } } },
        Buffer.from("%PDF-1.7").toString("base64"),
      ]);
      await login();
      return id;
    }
    const id = await invoice();
    const list = async () => (await db.query("SELECT finance_sales_list(0) d")).rows[0].d;
    let events = await list();
    assert.equal(events.length, 1);
    const eid = events[0].id;
    await db.exec("RESET ROLE");
    await db.query("UPDATE invoices SET state='issued' WHERE id=$1", [id]);
    await login();
    assert.equal((await list()).length, 1);
    const imported = (await db.query("SELECT finance_sales_import($1) d", [eid])).rows[0].d;
    assert.equal(imported.error, null);
    assert.ok(imported.journalId);
    assert.deepEqual(
      (await db.query("SELECT finance_sales_import($1) d", [eid])).rows[0].d,
      imported,
    );
    const trial = (await db.query("SELECT finance_snapshot('2026-01-01','2026-12-31') d")).rows[0].d
      .trial;
    assert.equal(trial.find((a) => a.account === "CLEARING").debit, "11900");
    assert.equal(trial.find((a) => a.account === "ADVANCES").credit, "11900");
    assert.equal(
      trial.some((a) => a.account === "SALES"),
      false,
    );
    const original = (await db.query("SELECT finance_sales_original($1) d", [eid])).rows[0].d;
    assert.ok(original.pdf);
    await invoice("final");
    const final = (await list()).find((e) => e.kind === "final");
    assert.match(
      (await db.query("SELECT finance_sales_import($1) d", [final.id])).rows[0].d.error,
      /Only issued advance/,
    );
    await invoice("advance", false);
    const unpaid = (await list()).find((e) => e.invoice_id !== id && e.kind === "advance");
    assert.match(
      (await db.query("SELECT finance_sales_import($1) d", [unpaid.id])).rows[0].d.error,
      /settlement missing/,
    );
    assert.equal((await list()).find((e) => e.id === unpaid.id).attempts, 1);
    assert.equal((await db.query("SELECT * FROM finance_journals")).rows.length, 1);
    await invoice("advance", true, false);
    assert.equal((await list()).length, 3);
    const mismatch = await invoice("advance", true, true, "11800");
    const mismatchEvent = (await list()).find((e) => e.invoice_id === mismatch);
    assert.match(
      (await db.query("SELECT finance_sales_import($1) d", [mismatchEvent.id])).rows[0].d.error,
      /totals differ/,
    );
    const closed = await invoice();
    const ce = (await list()).find((e) => e.invoice_id === closed);
    await db.exec("SELECT finance_set_period('2026-10-01',true,'Close test period')");
    assert.match(
      (await db.query("SELECT finance_sales_import($1) d", [ce.id])).rows[0].d.error,
      /closed/,
    );
    await db.exec("SELECT finance_set_period('2026-10-01',false,'Reopen test period')");
    assert.equal(
      (await db.query("SELECT finance_sales_import($1) d", [ce.id])).rows[0].d.error,
      null,
    );
    await db.query("SELECT finance_set_member($1,$2)", [staff, "staff"]);
    await login(staff);
    await assert.rejects(db.query("SELECT finance_sales_import($1)", [eid]), /Forbidden/);
    await assert.rejects(db.exec("SELECT finance_sales_rescan()"), /Forbidden/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.exec("SELECT * FROM finance_sales_events"), /permission denied/);
  } finally {
    await db.close();
  }
});
