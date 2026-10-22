import test from "node:test";
import assert from "node:assert/strict";
import { needsPreparation } from "../src/lib/order-preparation.ts";
test("paid orders stay in preparation through packing and leave at dispatch", () => {
  for (const status of [null, "ordered", "pending", "packaging", "processing"])
    assert.equal(needsPreparation({ status, payment_status: "paid" }), true, String(status));
  for (const status of ["out_for_delivery", "shipped", "delivered", "cancelled"])
    assert.equal(needsPreparation({ status, payment_status: "paid" }), false, status);
  for (const payment_status of [null, "pending", "failed", "refunded", "partially_refunded"])
    assert.equal(
      needsPreparation({ status: "packaging", payment_status }),
      false,
      String(payment_status),
    );
});
