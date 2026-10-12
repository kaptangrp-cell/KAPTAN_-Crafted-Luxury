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

test("multiple selections generate every combination without duplicates", async () => {
  const { optionCombinations, OptionSelectionsSchema, optionIdentity } =
    await import("../src/lib/product-options.ts");
  const combinations = optionCombinations(["Black", "Brown", "black"], ["S", "Medium", "Large"]);
  assert.equal(combinations.length, 6);
  assert.equal(combinations[5].variant_value, "Brown / Large");
  assert.equal(optionCombinations([], ["S", "Large"]).length, 2);
  assert.deepEqual(optionCombinations([], []), []);
  assert.equal(
    optionIdentity({ variant_type: "Colour", variant_value: "Black" }),
    optionIdentity({ variant_type: "Color", variant_value: "black" }),
  );
  assert.equal(
    OptionSelectionsSchema.safeParse({ colors: ["Black / Brown"], sizes: [] }).success,
    false,
  );
  assert.equal(
    OptionSelectionsSchema.safeParse({
      colors: Array(11).fill("Black"),
      sizes: Array(10).fill("S"),
    }).success,
    false,
  );
});
