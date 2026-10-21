import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("purchase labels retain identities, enforce quantities and permissions, and trace receipt exactly once", async () => {
  const db = new PGlite();
  try {
    const source = await readFile(
      new URL("./payment-first-database.test.mjs", import.meta.url),
      "utf8",
    );
    await db.exec(source.match(/const fixture = `([\s\S]*?)`;/)[1]);
    await db.exec(
      `CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user',true),'')::uuid$$;CREATE TABLE profiles(id uuid PRIMARY KEY,role text DEFAULT 'customer',full_name text);CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')$$;ALTER TABLE product_variants ALTER COLUMN id SET DEFAULT gen_random_uuid();CREATE TABLE finance_documents(id uuid PRIMARY KEY,state text,filename text);`,
    );
    for (const file of [
      "docs/APPLY-PAYMENT-FIRST.sql",
      "supabase/migrations/20261014090000_qr_warehouse.sql",
      "supabase/migrations/20261021100000_unit_operations.sql",
    ])
      await db.exec(await readFile(new URL("../" + file, import.meta.url), "utf8"));
    const admin = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID(),
      product = randomUUID(),
      variant = randomUUID(),
      doc = randomUUID();
    for (const [id, role] of [
      [admin, "admin"],
      [worker, "customer"],
      [outsider, "customer"],
    ]) {
      await db.query("INSERT INTO auth.users VALUES($1,$2,now())", [id, id + "@example.test"]);
      await db.query("INSERT INTO profiles VALUES($1,$2,$3)", [id, role, role]);
    }
    const login = (id) => db.query("SELECT set_config('test.user',$1,false)", [id]);
    await login(admin);
    await db.query(
      "INSERT INTO products(id,name,price,stock_quantity) VALUES($1,'Premium Leather Wallet',15,0)",
      [product],
    );
    await db.query(
      "INSERT INTO product_variants(id,product_id,variant_type,variant_value,price_modifier,stock_quantity,is_available) VALUES($1,$2,'Color / Size','Black / S',0,0,true)",
      [variant, product],
    );
    await db.query("SELECT warehouse_admin('enable',$1,$2)", [
      { productId: product },
      randomUUID(),
    ]);
    await db.query("INSERT INTO finance_documents VALUES($1,'ready','invoice.pdf')", [doc]);
    const pid = randomUUID(),
      payload = {
        supplier: "Supplier",
        reference: "PO-1",
        date: "2026-10-21",
        document: doc,
        lines: [{ variant, quantity: 2 }],
      };
    const save = () => db.query("SELECT operations_purchase($1,$2)", [pid, payload]);
    await save();
    await save();
    const line = (
      await db.query("SELECT id FROM inventory_purchase_lines WHERE purchase_id=$1", [pid])
    ).rows[0].id;
    const operation = randomUUID(),
      create = () => db.query("SELECT operations_labels($1,$2,2,'Main') result", [operation, line]);
    const result = (await create()).rows[0].result;
    assert.equal(result.length, 2);
    assert.match(result[0].unit_number, /^KPLWB-\d+$/);
    assert.notEqual(result[0].unit_number, result[1].unit_number);
    assert.deepEqual((await create()).rows[0].result, result);
    await assert.rejects(
      db.query("SELECT operations_labels($1,$2,1,'Main')", [randomUUID(), line]),
      /exceed/,
    );
    assert.equal((await db.query("SELECT count(*)::int n FROM inventory_events")).rows[0].n, 2);
    const trace = (code) => db.query("SELECT operations_unit($1) result", [code]);
    assert.equal((await trace(result[0].unit_number)).rows[0].result.purchase.reference, "PO-1");
    await db.query("SELECT warehouse_admin('staff',$1,$2)", [
      { email: worker + "@example.test", permissions: ["receive"] },
      randomUUID(),
    ]);
    await login(worker);
    await assert.rejects(save(), /Forbidden/);
    await assert.rejects(create(), /Forbidden/);
    const op = randomUUID();
    for (let n = 0; n < 2; n++)
      await db.query("SELECT warehouse_scan($1,'receive','','Arrival',$2)", [result[0].id, op]);
    const traced = (await trace("KPT:UNIT:1:" + result[0].id)).rows[0].result;
    assert.equal(traced.state, "available");
    assert.equal(traced.events.length, 2);
    assert.equal(traced.events[0].location, "Main");
    assert.equal(traced.purchase, undefined);
    assert.equal(
      (await db.query("SELECT stock_quantity FROM products WHERE id=$1", [product])).rows[0]
        .stock_quantity,
      1,
    );
    const moveId = randomUUID();
    for (let n = 0; n < 2; n++)
      await db.query("SELECT operations_move($1,$2,'Festival A')", [moveId, result[0].id]);
    assert.equal((await trace(result[0].unit_number)).rows[0].result.events.length, 3);
    assert.equal(
      (await db.query("SELECT stock_quantity FROM products WHERE id=$1", [product])).rows[0]
        .stock_quantity,
      1,
    );
    await assert.rejects(
      db.query("SELECT festival_basket($1,'Fair',$2)", [randomUUID(), [result[0].id]]),
      /Forbidden/,
    );
    await login(admin);
    const basketId = randomUUID();
    const basket = () =>
      db.query("SELECT festival_basket($1,'Fair',$2) result", [basketId, [result[0].id]]);
    assert.equal((await basket()).rows[0].result.total, "1500");
    assert.equal((await basket()).rows[0].result.seller, admin);
    await assert.rejects(
      db.query("SELECT festival_basket($1,'Fair',$2)", [
        randomUUID(),
        [result[0].id, result[0].id],
      ]),
      /Invalid basket/,
    );
    await assert.rejects(
      db.query("SELECT festival_basket($1,'Fair',$2)", [randomUUID(), [result[1].id]]),
      /no longer available/,
    );
    assert.equal((await trace(result[0].unit_number)).rows[0].result.state, "available");
    await login(outsider);
    await assert.rejects(trace(result[0].unit_number), /Forbidden/);
    await login(admin);
    assert.equal(
      (await db.query("SELECT operations_list() result")).rows[0].result.purchases[0].lines[0]
        .received,
      1,
    );
    await assert.rejects(
      db.query("UPDATE inventory_units SET unit_number='KCHANGED-1' WHERE id=$1", [result[0].id]),
      /permanent/,
    );
    await db.query("UPDATE products SET name='Renamed wallet' WHERE id=$1", [product]);
    assert.equal(
      (await trace(result[0].unit_number)).rows[0].result.unit_number,
      result[0].unit_number,
    );
    const reprint = (await db.query("SELECT warehouse_dashboard(true,NULL,$1) result", [operation]))
      .rows[0].result.labels;
    assert.equal(reprint.find((x) => x.id === result[0].id).unit_number, result[0].unit_number);
  } finally {
    await db.close();
  }
});
