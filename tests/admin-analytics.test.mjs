import test from "node:test";
import assert from "node:assert/strict";
import { reportingWindow, summarizeOrders } from "../src/lib/admin-analytics.ts";

const item = (product_name, quantity, line_total, cost = 5) => ({
  product_name,
  quantity,
  line_total,
  products: cost === null ? null : { cost_price: cost },
});
const order = (id, extra = {}) => ({
  id,
  total: 20,
  status: "ordered",
  payment_status: "paid",
  created_at: "2026-10-08T12:00:00Z",
  user_id: "customer-1",
  customer_email: null,
  order_items: [item("Wallet", 1, 20)],
  ...extra,
});

test("sales exclude unpaid, cancelled, failed and refunded orders", () => {
  const report = summarizeOrders(
    [
      order("paid"),
      order("unpaid", { payment_status: "pending" }),
      order("cancelled", { status: "cancelled" }),
      order("failed", { payment_status: "failed" }),
      order("refunded", { payment_status: "refunded" }),
    ],
    10,
  );
  assert.equal(report.totalRevenue, 20);
  assert.equal(report.totalOrders, 1);
  assert.equal(report.averageOrderValue, 20);
  assert.equal(report.conversionRate, 0.1);
});
test("product filter preserves whole-order totals and uses matching items for ranking and margin", () => {
  const report = summarizeOrders(
    [
      order("1", { total: 50, order_items: [item("Wallet", 1, 20), item("Bag", 1, 30, 10)] }),
      order("2", { order_items: [item("Bag", 1, 20)] }),
    ],
    10,
    "Wallet",
  );
  assert.equal(report.totalOrders, 1);
  assert.equal(report.totalRevenue, 50);
  assert.deepEqual(report.bestProducts, [{ product_name: "Wallet", quantity: 1, revenue: 20 }]);
  assert.equal(report.profit, 15);
  assert.deepEqual(report.productNames, ["Bag", "Wallet"]);
});
test("missing costs do not become zero costs; guest repeat buyers normalize email", () => {
  const report = summarizeOrders(
    [
      order("1", {
        user_id: null,
        customer_email: " Guest@Example.com ",
        order_items: [item("Wallet", 1, 20, null)],
      }),
      order("2", { user_id: null, customer_email: "guest@example.com" }),
      order("3", { user_id: null, customer_email: "" }),
      order("4", { user_id: null, customer_email: "" }),
    ],
    0,
  );
  assert.equal(report.totalCustomers, 3);
  assert.equal(report.returningCustomers, 1);
  assert.equal(report.itemsMissingCost, 1);
  assert.equal(report.profit, 45);
  assert.equal(report.profitRevenueBasis, 60);
  assert.equal(report.conversionRate, null);
});
test("last month handles long months, leap years and year boundaries in UTC", () => {
  for (const [now, start, end] of [
    ["2026-03-31T23:00:00Z", "2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"],
    ["2024-03-31T12:00:00Z", "2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"],
    ["2026-01-31T12:00:00Z", "2025-12-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
  ]) {
    const window = reportingWindow("last_month", new Date(now));
    assert.equal(window.start.toISOString(), start);
    assert.equal(window.end.toISOString(), end);
  }
});
test("empty reports and all-time windows are explicit", () => {
  const report = summarizeOrders([], 0);
  assert.equal(report.totalRevenue, 0);
  assert.equal(report.averageOrderValue, 0);
  assert.equal(report.returningCustomerRate, 0);
  assert.deepEqual(report.salesByDay, []);
  assert.equal(reportingWindow("all").start, null);
});
