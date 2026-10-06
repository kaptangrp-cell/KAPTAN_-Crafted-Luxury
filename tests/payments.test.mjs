import test from "node:test";
import assert from "node:assert/strict";
import { cents, verifyPayment, verifyPaypalOrder } from "../src/lib/payments/verification.ts";

test("Stripe verification rejects wrong order, amount, currency, provider, and unpaid status", () => {
  const expected = { orderId: "order-a", providerId: "pi_a", total: 20.99 };
  const valid = {
    orderId: "order-a",
    providerId: "pi_a",
    amount: 2099,
    currency: "eur",
    paid: true,
  };
  assert.doesNotThrow(() => verifyPayment(valid, expected));
  for (const patch of [
    { orderId: "order-b" },
    { providerId: "pi_b" },
    { amount: 1 },
    { currency: "usd" },
    { paid: false },
  ])
    assert.throws(() => verifyPayment({ ...valid, ...patch }, expected));
  assert.equal(cents(20.99), 2099);
  assert.throws(() => cents(NaN));
});

test("PayPal requires matching reference and captured amount, not just COMPLETED", () => {
  const expected = { providerId: "PAYPAL123", orderNumber: "KPT-123", total: 20.99 };
  const payment = {
    id: "PAYPAL123",
    status: "COMPLETED",
    purchase_units: [
      {
        reference_id: "KPT-123",
        invoice_id: "KPT-123",
        amount: { value: "20.99", currency_code: "EUR" },
        payments: {
          captures: [
            {
              id: "capture",
              status: "COMPLETED",
              amount: { value: "20.99", currency_code: "EUR" },
            },
          ],
        },
      },
    ],
  };
  assert.doesNotThrow(() => verifyPaypalOrder(payment, expected, true));
  assert.throws(() => verifyPaypalOrder(payment, { ...expected, orderNumber: "OTHER" }, true));
  assert.throws(() => verifyPaypalOrder(payment, { ...expected, total: 200 }, true));
  assert.throws(() => verifyPaypalOrder({ ...payment, id: "OTHER" }, expected, true));
  const pending = structuredClone(payment);
  pending.purchase_units[0].payments.captures[0].status = "PENDING";
  assert.throws(() => verifyPaypalOrder(pending, expected, true));
  const wrong = structuredClone(payment);
  wrong.purchase_units[0].amount.currency_code = "USD";
  assert.throws(() => verifyPaypalOrder(wrong, expected));
});
