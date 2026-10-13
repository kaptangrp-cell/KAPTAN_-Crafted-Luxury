import test from "node:test";
import assert from "node:assert/strict";
import {
  assistantIntent,
  assistantBudget,
  matchAssistantProducts,
} from "../src/lib/store-assistant.ts";
const product = (name, price, color = "Brown") => ({
  name,
  price,
  short_description: "Genuine leather",
  full_description: null,
  specifications: {},
  categories: { name: "Wallets" },
  product_variants: [{ variant_type: "color", variant_value: color, is_available: true }],
});
const catalogue = [product("Classic Wallet", 25), product("Premium Wallet", 50, "Black")];
test("assistant routes English and German store questions", () => {
  for (const q of ["What is the return policy?", "Wie funktioniert die Rückgabe?"])
    assert.equal(assistantIntent(q), "returns");
  for (const q of ["Where is my order?", "Meine Bestellung verfolgen"])
    assert.equal(assistantIntent(q), "tracking");
  assert.equal(assistantIntent("Lieferzeit?"), "shipping");
  assert.equal(assistantIntent("How do I care for leather?"), "care");
});
test("assistant matches translated products, colours and budgets", () => {
  for (const q of [
    "Show me brown wallets under €30",
    "Zeige mir braune Geldbörsen unter €30",
    "wallets between 20 and 30",
    "wallets above 40",
  ]) {
    assert.equal(matchAssistantProducts(catalogue, q).length, 1, q);
  }
  assert.equal(matchAssistantProducts(catalogue, "wallets above 40")[0].price, 50);
  assert.deepEqual(assistantBudget("zwischen 30,50 und 10"), { min: 10, max: 30.5 });
  assert.equal(matchAssistantProducts(catalogue, "show catalogue").length, 2);
});
test("assistant refuses unknown requests and unavailable variant matches", () => {
  assert.deepEqual(matchAssistantProducts(catalogue, "weather forecast"), []);
  assert.deepEqual(matchAssistantProducts(catalogue, "blue wallets"), []);
  const hidden = product("Wallet", 25, "Blue");
  hidden.product_variants[0].is_available = false;
  assert.deepEqual(matchAssistantProducts([hidden], "blue wallets"), []);
});
