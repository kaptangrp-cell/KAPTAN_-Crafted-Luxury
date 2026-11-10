import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("festival sales require payment, permission, correct prices and atomic retry-safe stock updates", async () => {
  const db = new PGlite();
  try {
    const source = await readFile(
      new URL("./payment-first-database.test.mjs", import.meta.url),
      "utf8",
    );
    await db.exec(source.match(/const fixture = `([\s\S]*?)`;/)[1]);
    await db.exec(
      `CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user',true),'')::uuid$$; CREATE TABLE profiles(id uuid PRIMARY KEY,role text,full_name text); CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')$$; ALTER TABLE product_variants ALTER COLUMN id SET DEFAULT gen_random_uuid(); CREATE TABLE finance_documents(id uuid PRIMARY KEY,state text,filename text);`,
    );
    for (const file of [
      "docs/APPLY-PAYMENT-FIRST.sql",
      "supabase/migrations/20261014090000_qr_warehouse.sql",
      "supabase/migrations/20261021100000_unit_operations.sql",
      "supabase/migrations/20261110100000_festival_payment_recording.sql",
    ])
      await db.exec(await readFile(new URL("../" + file, import.meta.url), "utf8"));
    await db.exec(
      `CREATE TABLE finance_unit_costs(unit_id uuid PRIMARY KEY); CREATE TABLE finance_stock_events(id bigint PRIMARY KEY,unit_id uuid,old_state text,new_state text,processed_at timestamptz,journal_id uuid,delta bigint);`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261110090000_admin_record_management.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const admin = randomUUID(),
      outsider = randomUUID(),
      product = randomUUID(),
      variant = randomUUID();
    for (const [id, role] of [
      [admin, "admin"],
      [outsider, "customer"],
    ]) {
      await db.query("INSERT INTO auth.users VALUES($1,$2,now())", [id, id + "@test.test"]);
      await db.query("INSERT INTO profiles VALUES($1,$2,$2)", [id, role]);
    }
    const login = (id) => db.query("SELECT set_config('test.user',$1,false)", [id]);
    await login(admin);
    await db.query("INSERT INTO products(id,name,price,stock_quantity) VALUES($1,'Lamp',20,0)", [
      product,
    ]);
    await db.query(
      "INSERT INTO product_variants(id,product_id,variant_type,variant_value,price_modifier,stock_quantity,is_available) VALUES($1,$2,'Size','Small',0,0,true)",
      [variant, product],
    );
    await db.query("SELECT warehouse_admin('enable',$1,$2)", [
      { productId: product },
      randomUUID(),
    ]);
    const labels = (
      await db.query("SELECT warehouse_admin('labels',$1,$2) result", [
        { variantId: variant, quantity: 2, location: "Main" },
        randomUUID(),
      ])
    ).rows[0].result;
    const units = Array.isArray(labels)
      ? labels.map((x) => x.id)
      : (await db.query("SELECT id FROM inventory_units")).rows.map((x) => x.id);
    const spare = randomUUID();
    await db.query(
      "INSERT INTO product_variants(id,product_id,variant_type,variant_value,stock_quantity) VALUES($1,$2,'Color','Unused',0)",
      [spare, product],
    );
    await login(outsider);
    await assert.rejects(
      db.query("SELECT admin_manage_record('variant_delete',$1)", [spare]),
      /Forbidden/,
    );
    await login(admin);
    await db.query("SELECT admin_manage_record('variant_delete',$1)", [spare]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM product_variants WHERE id=$1", [spare])).rows[0]
        .n,
      0,
    );
    await assert.rejects(
      db.query("SELECT admin_manage_record('variant_delete',$1)", [variant]),
      /history/,
    );
    const extra = randomUUID();
    await db.query("SELECT warehouse_admin('labels',$1,$2)", [
      { variantId: variant, quantity: 1, location: "Main" },
      extra,
    ]);
    await db.query("SELECT admin_manage_record('batch_delete',$1)", [extra]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM inventory_units WHERE batch_id=$1", [extra]))
        .rows[0].n,
      0,
    );
    const sale = randomUUID();
    const pay = (overrides = {}) => {
      const p = {
        id: sale,
        units,
        method: "cash",
        ref: "",
        total: 4000,
        received: true,
        ...overrides,
      };
      return db.query("SELECT festival_complete($1,'Fair',$2,$3,$4,$5,$6) result", [
        p.id,
        p.units,
        p.method,
        p.ref,
        p.total,
        p.received,
      ]);
    };
    await assert.rejects(pay({ received: false }), /Confirm payment/);
    await assert.rejects(pay(), /no longer available/);
    for (const unit of units)
      await db.query("SELECT warehouse_scan($1,'receive','','Arrival',$2)", [unit, randomUUID()]);
    await assert.rejects(
      db.query("SELECT admin_manage_record('label_delete',$1)", [units[0]]),
      /unused labels/,
    );
    await login(outsider);
    await assert.rejects(pay(), /Forbidden/);
    await login(admin);
    await assert.rejects(pay({ total: 1 }), /Prices changed/);
    await assert.rejects(pay({ method: "card_terminal" }), /terminal reference/);
    assert.equal((await db.query("SELECT stock_quantity FROM products")).rows[0].stock_quantity, 2);
    const first = (await pay()).rows[0].result;
    assert.equal(first.total, "4000");
    assert.deepEqual((await pay()).rows[0].result, first);
    await assert.rejects(pay({ total: 1 }), /Retry content differs/);
    await assert.rejects(pay({ id: randomUUID() }), /no longer available/);
    assert.equal((await db.query("SELECT count(*)::int n FROM festival_sales")).rows[0].n, 1);
    assert.equal((await db.query("SELECT stock_quantity FROM products")).rows[0].stock_quantity, 0);
    assert.equal((await db.query("SELECT sold_count FROM products")).rows[0].sold_count, 2);
  } finally {
    await db.close();
  }
});
