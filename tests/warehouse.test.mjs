import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { parseUnitCode, unitCode } from "../src/lib/warehouse.ts";

test("unit QR payload distinguishes shelf, URL and invalid codes", () => {
  const id = randomUUID();
  assert.equal(parseUnitCode(unitCode(id)), id);
  for (const bad of [id, "KPT:SHELF:1:" + id, "https://example.test/" + id, "KPT:UNIT:1:bad"])
    assert.throws(() => parseUnitCode(bad));
});
test("QR lifecycle, permissions, checkout holds and idempotent scans", async () => {
  const db = new PGlite();
  try {
    const source = await readFile(
      new URL("./payment-first-database.test.mjs", import.meta.url),
      "utf8",
    );
    await db.exec(source.match(/const fixture = `([\s\S]*?)`;/)[1]);
    await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text DEFAULT 'customer',full_name text);
 CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
 ALTER TABLE product_variants ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    await db.exec(
      await readFile(new URL("../docs/APPLY-PAYMENT-FIRST.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261014090000_qr_warehouse.sql", import.meta.url),
        "utf8",
      ),
    );
    const admin = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID(),
      product = randomUUID(),
      variant = randomUUID();
    for (const [id, role, email] of [
      [admin, "admin", "admin@test.example"],
      [worker, "customer", "worker@test.example"],
      [outsider, "customer", "other@test.example"],
    ]) {
      await db.query("INSERT INTO auth.users VALUES($1,$2,now())", [id, email]);
      await db.query("INSERT INTO profiles VALUES($1,$2,$3)", [id, role, email]);
    }
    const as = async (id) => db.query("SELECT set_config('test.user',$1,false)", [id]);
    await as(admin);
    await db.query("INSERT INTO products(id,name,price,stock_quantity) VALUES($1,'Belt',15,9)", [
      product,
    ]);
    await db.query(
      "INSERT INTO product_variants(id,product_id,variant_type,variant_value,price_modifier,stock_quantity,is_available) VALUES($1,$2,'Color / Size','Brown / 100',0,9,true)",
      [variant, product],
    );
    const manage = async (action, data, key = randomUUID()) =>
      (
        await db.query("SELECT warehouse_admin($1,$2,$3) result", [
          action,
          JSON.stringify(data),
          key,
        ])
      ).rows[0].result;
    await manage("enable", { productId: product });
    const stock = async () =>
      (await db.query("SELECT stock_quantity FROM products WHERE id=$1", [product])).rows[0]
        .stock_quantity;
    assert.equal(await stock(), 0);
    const labelsKey = randomUUID();
    const labels = await manage(
      "labels",
      { variantId: variant, quantity: 3, location: "A1" },
      labelsKey,
    );
    assert.equal(labels.length, 3);
    assert.deepEqual(
      await manage("labels", { variantId: variant, quantity: 3, location: "A1" }, labelsKey),
      labels,
    );
    assert.equal(await stock(), 0);
    await manage("staff", {
      email: "worker@test.example",
      permissions: ["receive", "dispatch", "return", "inspect", "sell"],
    });
    await as(worker);
    await assert.rejects(
      db.query("UPDATE profiles SET role='admin' WHERE id=$1", [worker]),
      /Forbidden/,
    );
    await assert.rejects(
      manage("labels", { variantId: variant, quantity: 1, location: "A1" }),
      /Forbidden/,
    );
    const scan = async (id, action, order = "", reason = "", key = randomUUID()) =>
      (
        await db.query("SELECT warehouse_scan($1,$2,$3,$4,$5) result", [
          id,
          action,
          order,
          reason,
          key,
        ])
      ).rows[0].result;
    const key = randomUUID();
    const received = await scan(labels[0].id, "receive", "", "", key);
    assert.equal(received.state, "available");
    assert.deepEqual(await scan(labels[0].id, "receive", "", "", key), received);
    await assert.rejects(scan(labels[0].id, "receive"), /Invalid scan/);
    for (const label of labels.slice(1)) await scan(label.id, "receive");
    assert.equal(await stock(), 3);
    await assert.rejects(
      db.query("UPDATE products SET stock_quantity=500 WHERE id=$1", [product]),
      /require a scan/,
    );
    await assert.rejects(
      db.query("UPDATE product_variants SET variant_value='Black / 100' WHERE id=$1", [variant]),
      /identity/,
    );
    const payload = {
      customer_name: "Test",
      customer_email: "customer@test.example",
      payment_method: "card",
      expectedTotal: 35.99,
      items: [{ productId: product, variantId: variant, quantity: 2 }],
    };
    const checkoutKey = randomUUID();
    const checkout = async () =>
      (
        await db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4) result", [
          checkoutKey,
          "owner",
          "hash",
          JSON.stringify(payload),
        ])
      ).rows[0].result;
    const order = await checkout();
    assert.deepEqual(await checkout(), order);
    assert.equal(await stock(), 1);
    const reserved = (
      await db.query("SELECT id FROM inventory_units WHERE state='reserved' ORDER BY id")
    ).rows;
    await assert.rejects(scan(reserved[0].id, "sell", "", "receipt"), /Invalid scan/);
    await assert.rejects(scan(reserved[0].id, "pack", order.orderId), /paid/);
    await db.query(
      "UPDATE order_checkouts SET provider_kind='stripe_checkout',provider_id='cs_test' WHERE order_id=$1",
      [order.orderId],
    );
    await db.query("SELECT settle_checkout_order($1,'paid')", [order.orderId]);
    await db.query("SELECT settle_checkout_order($1,'paid')", [order.orderId]);
    // Packing may substitute a different physical unit of the identical variant.
    const available = (await db.query("SELECT id FROM inventory_units WHERE state='available'"))
      .rows[0].id;
    await scan(available, "pack", order.orderNumber);
    assert.equal(await stock(), 1);
    const remaining = (await db.query("SELECT id FROM inventory_units WHERE state='reserved'"))
      .rows[0].id;
    await scan(remaining, "pack", order.orderNumber);
    assert.equal(await stock(), 1);
    await assert.rejects(
      db.query("UPDATE orders SET status='out_for_delivery' WHERE id=$1", [order.orderId]),
      /Scan every QR unit/,
    );
    await scan(available, "dispatch", order.orderNumber);
    assert.equal(await stock(), 1);
    await scan(available, "return");
    assert.equal(await stock(), 1);
    await scan(available, "pass");
    assert.equal(await stock(), 2);
    await assert.rejects(scan(available, "pass"), /Invalid scan/);
    await scan(available, "sell", "", "Receipt 42");
    assert.equal(await stock(), 1);
    await scan(available, "return");
    await scan(available, "reject", "", "Damaged seam");
    assert.equal(await stock(), 1);
    // An unpaid checkout releases only its own serial reservations once.
    const payload2 = {
      ...payload,
      expectedTotal: 20.99,
      items: [{ productId: product, variantId: variant, quantity: 1 }],
    };
    const draft = (
      await db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4) result", [
        randomUUID(),
        "owner2",
        "hash2",
        JSON.stringify(payload2),
      ])
    ).rows[0].result;
    assert.equal(await stock(), 0);
    await db.query("SELECT settle_checkout_order($1,'released')", [draft.orderId]);
    await db.query("SELECT settle_checkout_order($1,'released')", [draft.orderId]);
    assert.equal(await stock(), 1);
    await as(admin);
    await manage("staff", { email: "worker@test.example", permissions: ["receive"] });
    await as(worker);
    await assert.rejects(scan(remaining, "dispatch", order.orderNumber), /Forbidden/);
    await assert.rejects(
      db.query("SELECT warehouse_dashboard(false,$1,NULL)", [order.orderNumber]),
      /Forbidden/,
    );
    await assert.rejects(db.query("SELECT warehouse_dashboard(true,NULL,NULL)"), /Forbidden/);
    await as(admin);
    await manage("staff", { email: "worker@test.example", permissions: [] });
    await as(worker);
    await assert.rejects(scan(remaining, "dispatch", order.orderNumber), /Forbidden/);
    await assert.rejects(db.query("SELECT warehouse_dashboard(true,NULL,NULL)"), /Forbidden/);
    await as(outsider);
    await assert.rejects(db.query("SELECT warehouse_dashboard(false,NULL,NULL)"), /Forbidden/);
    const counts = (await db.query("SELECT count(*)::int n FROM inventory_events")).rows[0].n;
    assert.ok(counts > 15);
    // Direct database clients cannot write private warehouse records or invoke payment functions.
    await db.exec("SET ROLE authenticated");
    await assert.rejects(db.query("SELECT * FROM inventory_units"), /permission denied/);
    await assert.rejects(db.query("DELETE FROM inventory_events"), /permission denied/);
    await assert.rejects(
      db.query("SELECT settle_checkout_order($1,'released')", [draft.orderId]),
      /permission denied/,
    );
    await db.exec("RESET ROLE");
  } finally {
    await db.close();
  }
});
