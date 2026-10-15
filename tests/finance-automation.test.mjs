import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("owner-enabled automation posts future verified sales, isolates failures and restores caller identity", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    worker = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}'),('${worker}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('app.user',true),''))::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin'),('${worker}','customer');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);CREATE TABLE orders(id uuid PRIMARY KEY,total numeric,payment_status text);CREATE TABLE order_checkouts(order_id uuid,state text,provider_id text,provider_kind text);CREATE TABLE invoices(id uuid PRIMARY KEY,order_id uuid,number text,kind text,state text,model jsonb,source jsonb,pdf_base64 text);CREATE TABLE products(id uuid PRIMARY KEY,name text);CREATE TABLE product_variants(id uuid PRIMARY KEY,variant_value text);CREATE TABLE inventory_units(id uuid PRIMARY KEY,product_id uuid,variant_id uuid,batch_id uuid,state text,created_at timestamptz DEFAULT now());CREATE TABLE inventory_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,unit_id uuid,old_state text,new_state text,created_at timestamptz DEFAULT now());`,
    );
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261015120000_finance_reports.sql",
      "20261015130000_finance_sales_inbox.sql",
      "20261015140000_finance_banking.sql",
      "20261015150000_finance_costing.sql",
      "20261015160000_finance_sales_completion.sql",
      "20261015190000_finance_automation.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async (id) =>
      db.exec(
        `RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('app.user','${id}',false);SET ROLE authenticated;`,
      );
    await login(worker);
    await assert.rejects(db.query("SELECT finance_automation_settings(true,true)"), /Forbidden/);
    await login(owner);
    let cfg = (await db.query("SELECT finance_automation_settings() r")).rows[0].r;
    assert.equal(cfg.sales, false);
    await db.query("SELECT finance_automation_settings(true,true)");
    const invoice = async (paid = true, date = "2026-10-15") => {
      await login(worker);
      await db.exec("RESET ROLE");
      const order = randomUUID(),
        id = randomUUID();
      await db.query("INSERT INTO orders VALUES($1,100,$2)", [order, paid ? "paid" : "pending"]);
      if (paid)
        await db.query("INSERT INTO order_checkouts VALUES($1,'paid','verified','paypal')", [
          order,
        ]);
      await db.query("INSERT INTO invoices VALUES($1,$2,$3,'advance','issued',$4,$5,'pdf')", [
        id,
        order,
        id,
        { gross: 10000, rounding: 0, paidDate: date, taxMode: "kleinunternehmer" },
        { order: { tax_data: { currency: "EUR" } } },
      ]);
      assert.equal((await db.query("SELECT auth.uid() id")).rows[0].id, worker);
      return (await db.query("SELECT * FROM finance_sales_events WHERE invoice_id=$1", [id]))
        .rows[0];
    };
    const a = await invoice();
    assert.ok(a.journal_id);
    assert.equal(a.last_error, null);
    const unpaid = await invoice(false);
    assert.equal(unpaid.journal_id, null);
    assert.match(unpaid.last_error, /settlement missing/);
    const outside = await invoice(true, "2025-01-01");
    assert.equal(outside.journal_id, null);
    assert.match(outside.last_error, /Period missing/);
    // Warehouse event stays in review if historical costs are absent; scanner identity is restored.
    const pid = randomUUID(),
      vid = randomUUID(),
      unit = randomUUID();
    await db.query("INSERT INTO products VALUES($1,$2)", [pid, "Wallet"]);
    await db.query("INSERT INTO product_variants VALUES($1,$2)", [vid, "Black"]);
    await db.query(
      "INSERT INTO inventory_units(id,product_id,variant_id,batch_id,state) VALUES($1,$2,$3,$4,'sold')",
      [unit, pid, vid, randomUUID()],
    );
    await db.query(
      "INSERT INTO inventory_events(unit_id,old_state,new_state) VALUES($1,'available','sold')",
      [unit],
    );
    const event = (await db.query("SELECT * FROM finance_stock_events")).rows[0];
    assert.match(event.last_error, /Missing historical/);
    assert.equal(event.processed_at, null);
    assert.equal((await db.query("SELECT auth.uid() id")).rows[0].id, worker);
    await login(owner);
    await db.query("SELECT finance_automation_settings(false,false)");
    const off = await invoice();
    assert.equal(off.journal_id, null);
    assert.equal(off.attempts, 0);
    await login(worker);
    await assert.rejects(db.query("SELECT finance_automation_settings()"), /Forbidden/);
  } finally {
    await db.close();
  }
});
