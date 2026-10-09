import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const fixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE products (id uuid PRIMARY KEY, name text, price numeric(10,2), stock_quantity int, sold_count int DEFAULT 0, is_available boolean DEFAULT true);
CREATE TABLE product_variants (id uuid PRIMARY KEY, product_id uuid REFERENCES products(id), variant_type text, variant_value text, price_modifier numeric, stock_quantity int, is_available boolean DEFAULT true);
CREATE TABLE product_images(id uuid PRIMARY KEY, product_id uuid);
CREATE TABLE orders(id uuid PRIMARY KEY,order_number text UNIQUE,user_id uuid,customer_name text,customer_email text,customer_phone text,shipping_address jsonb,payment_method text,payment_status text,status text,subtotal numeric,shipping_cost numeric,total numeric,discount numeric,admin_notes text);
CREATE TABLE order_items(id uuid DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),product_id uuid REFERENCES products(id),variant_id uuid REFERENCES product_variants(id),product_name text,variant_info text,quantity int,unit_price numeric,line_total numeric);
`;

test("payment-first checkout creates no order until paid and releases unpaid drafts safely", async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261006090000_checkout_integrity.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261009190000_payment_before_order.sql", import.meta.url),
        "utf8",
      ),
    );
    const productId = randomUUID(),
      otherId = randomUUID(),
      variantId = randomUUID();
    await db.query(
      "INSERT INTO products(id,name,price,stock_quantity) VALUES ($1,'Wallet',15,3),($2,'Bag',80,10)",
      [productId, otherId],
    );
    const payload = (items) => ({
      customer_name: "Test",
      customer_email: "test@example.test",
      customer_phone: "123",
      shipping_address: { country: "DE" },
      payment_method: "card",
      expectedTotal: items.reduce((total, i) => total + 15 * i.quantity, 0) + 5.99,
      items,
    });
    const create = async (items, key = randomUUID(), owner = "owner", hash = "hash") =>
      (
        await db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4::jsonb) AS result", [
          key,
          owner,
          hash,
          JSON.stringify(payload(items)),
        ])
      ).rows[0].result;
    const stock = async () =>
      Number(
        (await db.query("SELECT stock_quantity FROM products WHERE id=$1", [productId])).rows[0]
          .stock_quantity,
      );
    const key = randomUUID();
    const items = [{ productId, quantity: 2 }];
    const order = await create(items, key);
    assert.equal(await stock(), 1);
    assert.deepEqual(await create(items, key), order);
    assert.equal(await stock(), 1, "retry must not reserve twice");
    await assert.rejects(create(items, key, "attacker"));
    await assert.rejects(create(items, key, "owner", "different-payload"));
    await assert.rejects(
      create([
        { productId, quantity: 1 },
        { productId, quantity: 1 },
      ]),
    );
    assert.equal(await stock(), 1, "failed checkout rolls back");
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM orders")).rows[0].n),
      0,
      "unpaid checkout must not create an order",
    );
    assert.equal(Number((await db.query("SELECT count(*) AS n FROM order_items")).rows[0].n), 0);
    const saved = (
      await db.query("SELECT order_data FROM checkout_drafts WHERE id=$1", [order.orderId])
    ).rows[0].order_data;
    await assert.rejects(
      db.query("SELECT settle_checkout_order($1,'paid')", [order.orderId]),
      /provider is not bound/,
    );
    await db.query(
      "UPDATE order_checkouts SET provider_kind='stripe_checkout',provider_id='cs_test_paid' WHERE order_id=$1",
      [order.orderId],
    );
    assert.equal(Number(saved.total), 35.99);
    await db.query("SELECT settle_checkout_order($1,'paid')", [order.orderId]);
    await db.query("SELECT settle_checkout_order($1,'paid')", [order.orderId]);
    assert.equal(
      Number(
        (await db.query("SELECT sold_count FROM products WHERE id=$1", [productId])).rows[0]
          .sold_count,
      ),
      2,
    );
    await assert.rejects(db.query("SELECT settle_checkout_order($1,'released')", [order.orderId]));
    assert.equal(
      (await db.query("SELECT payment_status FROM orders WHERE id=$1", [order.orderId])).rows[0]
        .payment_status,
      "paid",
    );
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM orders")).rows[0].n),
      1,
      "duplicate confirmation creates one order",
    );
    const cancelled = await create([{ productId, quantity: 1 }]);
    await db.query("SELECT settle_checkout_order($1,'released')", [cancelled.orderId]);
    await db.query("SELECT settle_checkout_order($1,'released')", [cancelled.orderId]);
    assert.equal(await stock(), 1, "cancellation restores stock exactly once");
    assert.equal(
      (await db.query("SELECT * FROM orders WHERE id=$1", [cancelled.orderId])).rows.length,
      0,
      "cancelled checkout never becomes an order",
    );
    await assert.rejects(
      db.query("SELECT settle_checkout_order($1,'paid')", [cancelled.orderId]),
      /already settled/,
    );
    await assert.rejects(
      create(
        [{ productId, quantity: 1 }],
        (
          await db.query("SELECT request_key FROM order_checkouts WHERE order_id=$1", [
            cancelled.orderId,
          ])
        ).rows[0].request_key,
      ),
      /expired/,
    );
    await db.query(
      "INSERT INTO product_variants(id,product_id,variant_type,variant_value,price_modifier,stock_quantity) VALUES ($1,$2,'size','S',-2,0)",
      [variantId, otherId],
    );
    await assert.rejects(create([{ productId, variantId, quantity: 1 }]));
    await assert.rejects(create([{ productId: otherId, variantId, quantity: 1 }]));
    await assert.rejects(create([{ productId: otherId, quantity: 1 }]));
    await assert.rejects(create([{ productId, variantId: randomUUID(), quantity: 1 }]));
    assert.equal(await stock(), 1);

    // Provider initialization cannot race cancellation, and an in-flight PayPal capture keeps its reservation.
    const inFlight = await create([{ productId, quantity: 1 }]);
    await db.query(
      "UPDATE order_checkouts SET provider_kind='paypal',provider_id='TEST-PAYPAL',capture_started=true WHERE order_id=$1",
      [inFlight.orderId],
    );
    await assert.rejects(
      db.query("SELECT settle_checkout_order($1,'released','TEST-PAYPAL','paypal')", [
        inFlight.orderId,
      ]),
    );
    assert.equal(await stock(), 0);
    await db.query("SELECT settle_checkout_order($1,'paid')", [inFlight.orderId]);
    const orderCount = Number((await db.query("SELECT count(*) AS n FROM orders")).rows[0].n);
    await assert.rejects(create([{ productId, quantity: 1 }]));
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM orders")).rows[0].n),
      orderCount,
    );

    await db.exec("SET ROLE authenticated");
    await assert.rejects(db.query("SELECT * FROM order_checkouts"));
    await assert.rejects(db.query("SELECT * FROM checkout_drafts"));
    await assert.rejects(
      db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4::jsonb)", [
        randomUUID(),
        "owner",
        "hash",
        JSON.stringify(payload(items)),
      ]),
    );
  } finally {
    await db.close();
  }
});

test("older in-flight orders can still settle after the payment-first migration", async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261006090000_checkout_integrity.sql", import.meta.url),
        "utf8",
      ),
    );
    const id = randomUUID();
    await db.query("INSERT INTO products(id,name,price,stock_quantity) VALUES ($1,'Wallet',15,5)", [
      id,
    ]);
    const payload = {
      customer_name: "Test",
      customer_email: "test@example.test",
      customer_phone: "123",
      shipping_address: { country: "DE" },
      payment_method: "card",
      expectedTotal: 20.99,
      items: [{ productId: id, quantity: 1 }],
    };
    const result = (
      await db.query("SELECT create_checkout_order($1,'owner','hash',NULL,$2::jsonb) AS result", [
        randomUUID(),
        JSON.stringify(payload),
      ])
    ).rows[0].result;
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261009190000_payment_before_order.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query("SELECT settle_checkout_order($1,'paid')", [result.orderId]);
    await db.query("SELECT settle_checkout_order($1,'paid')", [result.orderId]);
    assert.equal(
      (await db.query("SELECT payment_status FROM orders WHERE id=$1", [result.orderId])).rows[0]
        .payment_status,
      "paid",
    );
    assert.equal(
      Number(
        (await db.query("SELECT sold_count FROM products WHERE id=$1", [id])).rows[0].sold_count,
      ),
      1,
    );
    await assert.rejects(
      db.query("SELECT create_checkout_order($1,'owner','hash',NULL,$2::jsonb)", [
        randomUUID(),
        JSON.stringify(payload),
      ]),
      /upgraded/,
    );
  } finally {
    await db.close();
  }
});
