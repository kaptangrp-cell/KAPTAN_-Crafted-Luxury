import test from "node:test";
import assert from "node:assert/strict";
import { activeOptions, optionParts, ProductOptionSchema } from "../src/lib/product-options.ts";

test("color and size resolve to one stock variant; legacy options remain readable", () => {
  assert.deepEqual(optionParts({ variant_type: "Color / Size", variant_value: "Brown / Large" }), {
    color: "Brown",
    size: "Large",
  });
  assert.deepEqual(optionParts({ variant_type: "Farbe", variant_value: "Schwarz" }), {
    color: "Schwarz",
  });
  assert.deepEqual(optionParts({ variant_type: "Size", variant_value: "S" }), { size: "S" });
  assert.deepEqual(optionParts({ variant_type: "Weight", variant_value: "2kg" }), {});
});
test("inactive options are hidden while active sold-out options remain visible", () => {
  const options = [
    { id: "a", is_available: false },
    { id: "b", is_available: true, stock_quantity: 0 },
    { id: "c", is_available: null },
  ];
  assert.deepEqual(
    activeOptions(options).map((v) => v.id),
    ["b", "c"],
  );
});
test("option validation rejects invalid stock, price and incomplete combinations", () => {
  const valid = {
    product_id: "12345678-1234-4234-8234-123456789012",
    variant_type: "Color / Size",
    variant_value: "Black / M",
    is_available: true,
    stock_quantity: 4,
    price_modifier: 2.5,
  };
  assert.equal(ProductOptionSchema.parse(valid).stock_quantity, 4);
  assert.equal(ProductOptionSchema.parse({ ...valid, stock_quantity: null }).stock_quantity, null);
  for (const patch of [
    { stock_quantity: -1 },
    { stock_quantity: 1.5 },
    { price_modifier: -1 },
    { variant_value: "Black" },
    { variant_value: " / M" },
    { variant_value: "Black / M / L" },
    { product_id: "bad" },
  ])
    assert.equal(ProductOptionSchema.safeParse({ ...valid, ...patch }).success, false);
});
