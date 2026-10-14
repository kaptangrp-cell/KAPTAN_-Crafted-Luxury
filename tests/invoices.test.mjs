import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { buildInvoice, berlinDate } from "../src/lib/invoices/model.ts";
import { invoiceXml } from "../src/lib/invoices/xml.ts";
import { invoiceRange, csvCell } from "../src/lib/invoices/reporting.ts";
import { consumerProduct } from "../src/lib/tax.ts";
import { billingSnapshot, emptyBilling } from "../src/lib/billing.ts";
const address = { line1: "Test 1", city: "Berlin", postal_code: "10115", country: "DE" };
const billing = billingSnapshot(
  { ...emptyBilling, emailConsent: true },
  { name: "Buyer <safe>", email: "buyer@example.test" },
  address,
);
const base = {
  taxMode: "regular",
  number: "KPT-WEB-00000001",
  kind: "advance",
  issueDate: "2026-10-14",
  supplyDate: null,
  paidDate: "2026-10-14",
  orderId: randomUUID(),
  orderNumber: "KPT-TEST",
  buyer: billing,
  items: [
    {
      product_id: randomUUID(),
      product_name: "Wallet & leather",
      variant_info: "Black / S",
      quantity: 3,
      unit_price: 1.18,
      line_total: 3.54,
    },
  ],
  shipping: 7.13,
  total: 10.67,
};
test("gross catalogue, net invoice amounts and payable rounding reconcile", () => {
  const product = consumerProduct({
    id: "a",
    price: 0.99,
    compare_at_price: 15,
    product_variants: [{ price_modifier: 0.99 }],
  });
  assert.equal(product.price, 0.99);
  assert.equal(product.product_variants[0].price_modifier, 0.99);
  const i = buildInvoice(base);
  assert.equal(i.net, 896);
  assert.equal(i.vat, 170);
  assert.equal(i.rounding, 1);
  assert.equal(i.gross + i.rounding - i.paid, i.due);
  const xml = invoiceXml(i);
  assert.match(xml, /Wallet &amp; leather/);
  assert.match(xml, /Buyer &lt;safe&gt;/);
  assert.match(xml, />0.01<\/cbc:PayableRoundingAmount>/);
  assert.throws(() => buildInvoice({ ...base, total: 11 }), /reconcile/);
  const reference = { number: i.number, date: i.issueDate, net: i.net, vat: i.vat, gross: i.paid };
  assert.throws(() => buildInvoice({ ...base, kind: "final", reference }), /supply date/);
  assert.match(
    invoiceXml(buildInvoice({ ...base, kind: "final", reference, supplyDate: "2026-10-15" })),
    /BillingReference/,
  );
  const credit = buildInvoice({ ...base, kind: "credit", reference, reason: "Full cancellation" });
  assert.equal(credit.due, 1067);
  assert.equal(credit.paid, 0);
  assert.match(invoiceXml(credit), /<CreditNote /);
});
test("invoice report periods follow Berlin days, Monday weeks, leap years and safe CSV", () => {
  assert.equal(berlinDate("2026-10-13T22:15:00Z"), "2026-10-14");
  assert.deepEqual(invoiceRange("week", "2026-10-18"), { from: "2026-10-12", to: "2026-10-18" });
  assert.equal(invoiceRange("month", "2024-02-15").to, "2024-02-29");
  assert.equal(csvCell(' =HYPERLINK("x")'), '"\' =HYPERLINK(""x"")"');
});
test("VAT checkout, invoice outbox, serial numbers, immutable archive and staff isolation", async () => {
  const db = new PGlite();
  try {
    const fixture = (
      await readFile(new URL("./payment-first-database.test.mjs", import.meta.url), "utf8")
    ).match(/const fixture = `([\s\S]*?)`;/)[1];
    await db.exec(fixture);
    await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text DEFAULT 'customer',full_name text);
 CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
 ALTER TABLE product_variants ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    for (const path of [
      "docs/APPLY-PAYMENT-FIRST.sql",
      "supabase/migrations/20261014090000_qr_warehouse.sql",
      "supabase/migrations/20261014120000_billing_profiles.sql",
      "supabase/migrations/20261014130000_german_vat.sql",
      "supabase/migrations/20261014140000_invoice_archive.sql",
    ])
      await db.exec(await readFile(new URL("../" + path, import.meta.url), "utf8"));
    const product = randomUUID(),
      key = randomUUID(),
      admin = randomUUID();
    await db.query("INSERT INTO products(id,name,price,stock_quantity) VALUES($1,'Wallet',15,5)", [
      product,
    ]);
    await db.query("INSERT INTO profiles(id,role) VALUES($1,'admin')", [admin]);
    const payload = {
      customer_name: "Buyer",
      customer_email: "buyer@example.test",
      shipping_address: address,
      billing_data: billing,
      payment_method: "card",
      expectedTotal: 24.98,
      items: [{ productId: product, quantity: 1 }],
    };
    const create = (body) =>
      db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4) result", [
        key,
        "owner",
        "hash",
        JSON.stringify(body),
      ]);
    await assert.rejects(create({ ...payload, expectedTotal: 20.99 }), /Prices changed/);
    const result = (await create(payload)).rows[0].result;
    assert.deepEqual((await create(payload)).rows[0].result, result);
    const draft = (
      await db.query("SELECT order_data FROM checkout_drafts WHERE id=$1", [result.orderId])
    ).rows[0].order_data;
    assert.equal(draft.total, 24.98);
    assert.equal(draft.tax_data.rate, 19);
    assert.equal((await db.query("SELECT count(*) FROM invoices")).rows[0].count, 0);
    await db.query(
      "UPDATE order_checkouts SET provider_kind='stripe_checkout',provider_id='cs_test' WHERE order_id=$1",
      [result.orderId],
    );
    await db.query("SELECT settle_checkout_order($1,'paid')", [result.orderId]);
    await db.query("SELECT settle_checkout_order($1,'paid')", [result.orderId]);
    let rows = (await db.query("SELECT * FROM invoices")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source.items.length, 1);
    assert.equal(rows[0].number, "KPT-WEB-00000001");
    const claim = (await db.query("SELECT claim_invoice() result")).rows[0].result;
    assert.equal(claim.id, rows[0].id);
    assert.equal((await db.query("SELECT claim_invoice() result")).rows[0].result, null);
    await assert.rejects(
      db.query("SELECT finish_invoice($1,$2,$3,$4,$5,$6,$7,$8)", [
        claim.id,
        claim.lease,
        "{}",
        "xml",
        "pdf",
        "hash",
        "hash",
        '{"accepted":false}',
      ]),
      /validation/,
    );
    const model = buildInvoice({
      ...base,
      number: claim.number,
      orderId: result.orderId,
      items: claim.source.items,
      shipping: 7.13,
      total: 24.98,
    });
    await db.query("SELECT finish_invoice($1,$2,$3,$4,$5,$6,$7,$8)", [
      claim.id,
      claim.lease,
      JSON.stringify(model),
      "xml",
      "pdf",
      "hash",
      "hash",
      '{"accepted":true}',
    ]);
    await assert.rejects(
      db.query("UPDATE invoices SET xml='altered' WHERE id=$1", [claim.id]),
      /immutable/,
    );
    await assert.rejects(db.query("DELETE FROM invoices WHERE id=$1", [claim.id]), /immutable/);
    await db.exec("SET ROLE authenticated");
    assert.equal((await db.query("SELECT count(*) FROM invoices")).rows[0].count, 0);
    await assert.rejects(db.query("SELECT claim_invoice()"), /permission denied/);
    await assert.rejects(
      db.query("SELECT invoice_admin_action($1,'credit',$2)", [
        claim.id,
        '{"reason":"Full cancellation"}',
      ]),
      /Forbidden/,
    );
    await db.query("SELECT set_config('test.user',$1,false)", [admin]);
    assert.equal((await db.query("SELECT count(*) FROM invoices")).rows[0].count, 1);
    await db.query("SELECT invoice_admin_action($1,'final',$2)", [
      claim.id,
      '{"supplyDate":"2026-10-14"}',
    ]);
    await assert.rejects(
      db.query("SELECT invoice_admin_action($1,'credit',$2)", [
        claim.id,
        '{"reason":"Full cancellation"}',
      ]),
      /final invoice/,
    );
    await db.exec("RESET ROLE");
    rows = (await db.query("SELECT * FROM invoices ORDER BY created_at")).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[1].source.reference.number, claim.number);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261014150000_kleinunternehmer_correction.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const exemptKey = randomUUID();
    const exemptCreate = (body) =>
      db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4) result", [
        exemptKey,
        "owner2",
        "hash2",
        JSON.stringify(body),
      ]);
    await assert.rejects(exemptCreate(payload), /Prices changed/);
    const exemptOrder = (await exemptCreate({ ...payload, expectedTotal: 20.99 })).rows[0].result;
    const exemptDraft = (
      await db.query("SELECT order_data FROM checkout_drafts WHERE id=$1", [exemptOrder.orderId])
    ).rows[0].order_data;
    assert.equal(exemptDraft.total, 20.99);
    assert.equal(exemptDraft.tax_data.mode, "kleinunternehmer");
    assert.equal(exemptDraft.tax_data.rate, 0);
    const historical = (await db.query("SELECT model FROM invoices WHERE id=$1", [claim.id]))
      .rows[0].model;
    assert.equal(historical.rate, 19);
    await db.query(
      "UPDATE order_checkouts SET provider_kind='stripe_checkout',provider_id='cs_exempt' WHERE order_id=$1",
      [exemptOrder.orderId],
    );
    await db.query("SELECT settle_checkout_order($1,'paid')", [exemptOrder.orderId]);
    const exemptSource = (
      await db.query("SELECT source FROM invoices WHERE order_id=$1", [exemptOrder.orderId])
    ).rows[0].source;
    const exemptModel = buildInvoice({
      ...base,
      taxMode: "kleinunternehmer",
      items: exemptSource.items,
      shipping: 5.99,
      total: 20.99,
    });
    assert.equal(exemptModel.vat, 0);
    assert.equal(exemptModel.rounding, 0);
    assert.equal(exemptModel.net, 2099);
    assert.match(invoiceXml(exemptModel), /<cbc:ID>E<\/cbc:ID>/);
    assert.match(invoiceXml(exemptModel), /TaxExemptionReason/);
    assert.match(exemptModel.exemptionReason, /§ 19/);
  } finally {
    await db.close();
  }
});
