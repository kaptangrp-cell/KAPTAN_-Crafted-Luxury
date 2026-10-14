import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { BillingInputSchema, billingSnapshot, emptyBilling } from "../src/lib/billing.ts";
const contact = { name: "Customer", email: "customer@example.test" };
const address = { line1: "Teststrasse 1", city: "Berlin", postal_code: "10115", country: "DE" };
test("billing differentiates buyer types and never uses a company name for a private buyer", () => {
  assert.equal(BillingInputSchema.safeParse(emptyBilling).success, false);
  assert.equal(
    BillingInputSchema.safeParse({ ...emptyBilling, emailConsent: true, customerType: "business" })
      .success,
    false,
  );
  assert.equal(
    BillingInputSchema.safeParse({
      ...emptyBilling,
      emailConsent: true,
      customerType: "public_authority",
      legalName: "Authority",
    }).success,
    false,
  );
  const b = billingSnapshot(
    { ...emptyBilling, emailConsent: true, legalName: "stale company", vatId: "stale" },
    contact,
    address,
  );
  assert.equal(b.legalName, contact.name);
  assert.equal(b.vatId, null);
  assert.throws(
    () =>
      billingSnapshot({ ...emptyBilling, emailConsent: true }, contact, {
        ...address,
        country: "FR",
      }),
    /Germany/,
  );
});
test("separate billing address and public authority routing are preserved", () => {
  const input = {
    ...emptyBilling,
    emailConsent: true,
    customerType: "public_authority",
    legalName: "Public authority",
    buyerReference: "reference-from-authority",
    sameAsShipping: false,
    line1: "Billing 2",
    city: "Marburg",
    postalCode: "35037",
    deliveryChannel: "portal",
    portalInstructions: "Submit through recipient portal",
  };
  const b = billingSnapshot(input, contact, address);
  assert.equal(b.address.line1, "Billing 2");
  assert.equal(b.customerType, "public_authority");
  assert.equal(b.buyerReference, input.buyerReference);
  assert.equal(b.deliveryChannel, "portal");
  assert.equal(BillingInputSchema.safeParse({ ...input, portalInstructions: "" }).success, false);
});
test("billing survives payment promotion, retries, and cannot overwrite a paid-order snapshot", async () => {
  const db = new PGlite();
  try {
    const fixture = (
      await readFile(new URL("./payment-first-database.test.mjs", import.meta.url), "utf8")
    ).match(/const fixture = `([\s\S]*?)`;/)[1];
    await db.exec(fixture);
    await db.exec(
      await readFile(new URL("../docs/APPLY-PAYMENT-FIRST.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261014120000_billing_profiles.sql", import.meta.url),
        "utf8",
      ),
    );
    const product = randomUUID(),
      key = randomUUID();
    await db.query("INSERT INTO products(id,name,price,stock_quantity) VALUES($1,'Wallet',15,3)", [
      product,
    ]);
    const billing = billingSnapshot(
      { ...emptyBilling, emailConsent: true, customerType: "business", legalName: "Buyer GmbH" },
      contact,
      address,
    );
    const payload = {
      customer_name: contact.name,
      customer_email: contact.email,
      shipping_address: address,
      billing_data: billing,
      payment_method: "card",
      expectedTotal: 20.99,
      items: [{ productId: product, quantity: 1 }],
    };
    const create = async (body = payload) =>
      (
        await db.query("SELECT create_checkout_draft($1,$2,$3,NULL,$4) result", [
          key,
          "owner",
          "hash",
          JSON.stringify(body),
        ])
      ).rows[0].result;
    await assert.rejects(create({ ...payload, billing_data: null }), /Billing details/);
    const first = await create();
    const before = (
      await db.query("SELECT order_data FROM checkout_drafts WHERE id=$1", [first.orderId])
    ).rows[0].order_data.billing_data;
    assert.equal(before.legalName, "Buyer GmbH");
    assert.ok(before.consentRecordedAt);
    assert.deepEqual(await create(), first);
    const retry = (
      await db.query("SELECT order_data FROM checkout_drafts WHERE id=$1", [first.orderId])
    ).rows[0].order_data.billing_data;
    assert.deepEqual(retry, before);
    await db.query(
      "UPDATE order_checkouts SET provider_kind='stripe_checkout',provider_id='cs_test' WHERE order_id=$1",
      [first.orderId],
    );
    await db.query("SELECT settle_checkout_order($1,'paid')", [first.orderId]);
    const saved = (await db.query("SELECT billing_data FROM orders WHERE id=$1", [first.orderId]))
      .rows[0].billing_data;
    assert.deepEqual(saved, before);
    await assert.rejects(
      db.query("UPDATE orders SET billing_data='{}' WHERE id=$1", [first.orderId]),
      /cannot be overwritten/,
    );
    await db.exec("SET ROLE service_role");
    await assert.rejects(
      db.query("SELECT create_checkout_draft_before_billing($1,$2,$3,NULL,$4)", [
        randomUUID(),
        "owner",
        "hash",
        JSON.stringify(payload),
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
