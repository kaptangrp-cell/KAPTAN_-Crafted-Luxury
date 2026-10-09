import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { readAccountOrders, readAccountOrder } from "../src/lib/account-orders.ts";
import { clearAccountCache } from "../src/lib/account-cache.ts";
import { useAuthStore } from "../src/stores/authStore.ts";

// Treat this client as privileged: application ownership filters must still hold.
function clientFor(rows, error = null) {
  return {
    from() {
      const filters = [];
      const result = () => ({
        data: rows.filter((row) =>
          filters.every(([key, value]) =>
            Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
          ),
        ),
        error,
      });
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        in(key, values) {
          filters.push([key, values]);
          return query;
        },
        order() {
          return Promise.resolve(result());
        },
        maybeSingle() {
          const response = result();
          return Promise.resolve({ ...response, data: response.data[0] ?? null });
        },
      };
      return query;
    },
  };
}

test("a new customer cannot inherit guest/other-account orders through matching contact email", async () => {
  const rows = [
    { id: "old-order", user_id: "old-account", customer_email: "new@example.test" },
    { id: "guest-order", user_id: null, customer_email: "new@example.test" },
    { id: "owned-order", user_id: "buyer", customer_email: "different@example.test" },
  ];
  for (const row of rows) row.payment_status = "paid";
  rows.push({ id: "unpaid-order", user_id: "buyer", payment_status: "pending" });
  const client = clientFor(rows);
  assert.deepEqual(await readAccountOrders(client, "new-account"), { orders: [] });
  assert.deepEqual((await readAccountOrders(client, "buyer")).orders, [rows[2]]);
  await assert.rejects(readAccountOrder(client, "new-account", "old-order"), /access denied/);
  await assert.rejects(readAccountOrder(client, "new-account", "guest-order"), /access denied/);
  assert.equal((await readAccountOrder(client, "buyer", "owned-order")).order.id, "owned-order");
  await assert.rejects(readAccountOrder(client, "buyer", "unpaid-order"), /access denied/);
  await assert.rejects(readAccountOrders(client, ""), /Sign in/);
  await assert.rejects(
    readAccountOrders(clientFor([], { message: "offline" }), "buyer"),
    /Could not load/,
  );
});

test("switching accounts drops cached private data and ignores late order responses", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    client.setQueryData(["my-orders", "A"], { orders: ["A-order"] });
    client.setQueryData(["admin-orders"], { orders: ["private"] });
    assert.equal(client.getQueryData(["my-orders", "B"]), undefined);
    let complete;
    const pending = client
      .fetchQuery({
        queryKey: ["order", "A", "late"],
        queryFn: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      })
      .catch(() => undefined);
    clearAccountCache(client, "A", "B");
    client.setQueryData(["my-orders", "B"], { orders: [] });
    complete({ order: "A-secret" });
    await pending;
    assert.equal(client.getQueryData(["admin-orders"]), undefined);
    assert.equal(client.getQueryData(["order", "A", "late"]), undefined);
    assert.deepEqual(client.getQueryData(["my-orders", "B"]), { orders: [] });
    clearAccountCache(client, "B", "B");
    assert.deepEqual(client.getQueryData(["my-orders", "B"]), { orders: [] });
    clearAccountCache(client, "B", undefined);
    assert.equal(client.getQueryCache().getAll().length, 0);
  } finally {
    client.clear();
  }
});

test("late profile loads cannot give a new customer the previous customer's admin identity", () => {
  const store = useAuthStore.getState();
  try {
    store.setUser({ id: "A" });
    store.setProfile({ id: "A", role: "admin" });
    assert.equal(useAuthStore.getState().isAdmin, true);
    store.setUser({ id: "B" });
    assert.equal(useAuthStore.getState().profile, null);
    assert.equal(useAuthStore.getState().isAdmin, false);
    store.setProfile({ id: "A", role: "admin" });
    assert.equal(useAuthStore.getState().profile, null);
    store.setProfile({ id: "B", role: "customer" });
    assert.equal(useAuthStore.getState().profile.id, "B");
  } finally {
    store.logout();
  }
});
