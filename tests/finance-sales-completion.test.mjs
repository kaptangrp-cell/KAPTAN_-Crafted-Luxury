import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("advance → supply → full credit → partial refunds conserves cash and revenue, with no duplicate postings", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    order = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);CREATE TABLE orders(id uuid PRIMARY KEY,total numeric,payment_status text);CREATE TABLE order_checkouts(order_id uuid,state text,provider_id text,provider_kind text);CREATE TABLE invoices(id uuid PRIMARY KEY,order_id uuid,number text,kind text,state text,model jsonb,source jsonb,pdf_base64 text);INSERT INTO orders VALUES('${order}',119,'paid');INSERT INTO order_checkouts VALUES('${order}','paid','verified','stripe');`,
    );
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261015120000_finance_reports.sql",
      "20261015130000_finance_sales_inbox.sql",
      "20261015140000_finance_banking.sql",
      "20261015160000_finance_sales_completion.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async () =>
      db.exec(`RESET ROLE;SELECT set_config('app.user','${owner}',false);SET ROLE authenticated;`);
    const lines = [
      { productId: randomUUID(), description: "Wallet", gross: 10000 },
      { productId: null, description: "Versand", gross: 1900 },
    ];
    const invoice = async (kind, reference) => {
      await db.exec("RESET ROLE");
      const id = randomUUID();
      await db.query("INSERT INTO invoices VALUES($1,$2,$3,$4,'issued',$5,$6,'pdf')", [
        id,
        order,
        kind,
        kind,
        {
          gross: 11900,
          rounding: 0,
          vat: 0,
          paidDate: "2026-10-15",
          supplyDate: "2026-10-16",
          issueDate: "2026-10-17",
          taxMode: "kleinunternehmer",
          lines,
          reference: reference ? { number: reference } : null,
        },
        { order: { tax_data: { currency: "EUR" } } },
      ]);
      await login();
      return (await db.query("SELECT id FROM finance_sales_events WHERE invoice_id=$1", [id]))
        .rows[0].id;
    };
    const advance = await invoice("advance"),
      final = await invoice("final", "advance");
    assert.match(
      (await db.query("SELECT finance_sales_complete($1) r", [final])).rows[0].r.error,
      /original first/,
    );
    const a = (await db.query("SELECT finance_sales_complete($1) r", [advance])).rows[0].r;
    assert.equal(a.error, null);
    const f = (await db.query("SELECT finance_sales_complete($1) r", [final])).rows[0].r;
    assert.equal(f.error, null);
    assert.ok(f.journalId);
    assert.deepEqual((await db.query("SELECT finance_sales_complete($1) r", [final])).rows[0].r, f);
    const totals = async () => {
      const r = await db.query(
        "SELECT account,sum(debit-credit)::text value FROM finance_lines l JOIN finance_journals j ON j.id=l.journal_id WHERE j.status='posted' GROUP BY account",
      );
      return Object.fromEntries(r.rows.map((x) => [x.account, x.value]));
    };
    assert.deepEqual(await totals(), {
      CLEARING: "11900",
      ADVANCES: "0",
      SALES: "-10000",
      SHIPPING: "-1900",
    });
    const credit = await invoice("credit", "final");
    assert.equal(
      (await db.query("SELECT finance_sales_complete($1) r", [credit])).rows[0].r.error,
      null,
    );
    let t = await totals();
    assert.equal(t.SALES, "0");
    assert.equal(t.SHIPPING, "0");
    assert.equal(t.REFUNDS_DUE, "-11900");
    assert.equal(t.CLEARING, "11900");
    const d = (
      await db.query("SELECT finance_document_reserve($1,'refund.pdf','application/pdf',100) d", [
        "a".repeat(64),
      ])
    ).rows[0].d;
    await db.exec("RESET ROLE;SET ROLE service_role");
    await db.query("SELECT finance_document_finish($1,$2)", [d.id, owner]);
    await login();
    const id = randomUUID();
    const pay = (key = id, amount = "5000", reference = "provider-refund-1") =>
      db.query("SELECT finance_refund_pay($1,$2,$3,$4,'2026-10-18',$5,'CLEARING') id", [
        key,
        credit,
        d.id,
        reference,
        amount,
      ]);
    const j = (await pay()).rows[0].id;
    assert.equal((await pay()).rows[0].id, j);
    await assert.rejects(pay(id, "5001"), /Retry content/);
    await assert.rejects(pay(randomUUID(), "6901", "provider-refund-2"), /exceeds/);
    await pay(randomUUID(), "6900", "provider-refund-2");
    t = await totals();
    assert.equal(t.CLEARING, "0");
    assert.equal(t.REFUNDS_DUE, "0");
    await assert.rejects(
      db.query("SELECT finance_reverse($1,'2026-10-18','Unlinked correction')", [a.journalId]),
      /linked invoice correction/,
    );
    const events = (await db.query("SELECT finance_sales_list(0) r")).rows[0].r;
    assert.equal(events.find((e) => e.id === credit).refunded, "11900");
    await db.exec("RESET ROLE;SET ROLE anon");
    await assert.rejects(
      db.query("SELECT finance_sales_complete($1)", [credit]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
