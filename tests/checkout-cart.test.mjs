import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
globalThis.window = { localStorage: globalThis.localStorage };
const { useCartStore } = await import("../src/stores/cartStore.ts");
const source = (
  await readFile(new URL("../src/lib/checkout-attempt.ts", import.meta.url), "utf8")
).replace("@/stores/cartStore", new URL("../src/stores/cartStore.ts", import.meta.url).href);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { prepareAttempt, recordAttemptOrder, finishAttempt, forgetAttempt } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("failed/abandoned checkout preserves persisted cart; only confirmed purchase removes its quantities once", async () => {
  await useCartStore.persist.rehydrate();
  const product = { id: "wallet", name: "Wallet", price: 15 };
  useCartStore.getState().addItem(product, null, 2, "");
  const payload = { items: [{ productId: product.id, quantity: 2 }] };
  const key = await prepareAttempt(payload, async () => {});
  recordAttemptOrder("attempt-1");
  assert.equal(
    useCartStore.getState().items[0].quantity,
    2,
    "starting checkout leaves cart intact",
  );
  assert.equal(await prepareAttempt(payload, async () => {}), key, "retry reuses checkout");
  assert.equal(
    JSON.parse(localStorage.getItem("kaptan-cart")).state.items[0].quantity,
    2,
    "abandoned basket persists across reload",
  );
  forgetAttempt("attempt-1"); // Provider cancellation/failed attempt: keep everything.
  assert.equal(useCartStore.getState().items[0].quantity, 2);
  await prepareAttempt(payload, async () => {});
  recordAttemptOrder("paid-attempt");
  useCartStore.getState().addItem(product, null, 1, "");
  await finishAttempt("other-attempt");
  assert.equal(useCartStore.getState().items[0].quantity, 3);
  await Promise.all([finishAttempt("paid-attempt"), finishAttempt("paid-attempt")]);
  assert.equal(
    useCartStore.getState().items[0].quantity,
    1,
    "only paid quantities are removed, once",
  );
  await finishAttempt("paid-attempt");
  assert.equal(useCartStore.getState().items[0].quantity, 1);
});
