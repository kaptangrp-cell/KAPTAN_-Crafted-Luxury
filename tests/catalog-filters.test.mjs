import test from "node:test";
import assert from "node:assert/strict";
import {
  CatalogSearchSchema,
  CatalogRequestSchema,
  literalPattern,
  colorVariantFilter,
} from "../src/lib/catalog-filters.ts";

test("shareable filters preserve zero prices and parse false without enabling stock filter", () => {
  const result = CatalogSearchSchema.parse({
    minPrice: "0",
    maxPrice: "25.50",
    inStock: "false",
    colors: ["Brown", "brown", " Beige "],
    page: "2",
  });
  assert.equal(result.minPrice, 0);
  assert.equal(result.maxPrice, 25.5);
  assert.equal(result.inStock, undefined);
  assert.deepEqual(result.colors, ["brown", "beige"]);
  assert.equal(result.page, 2);
  assert.equal(CatalogSearchSchema.parse({ inStock: "true" }).inStock, true);
  assert.deepEqual(CatalogSearchSchema.parse({ colors: "Black" }).colors, ["black"]);
});
test("bad links recover and inverted price ranges are normalized", () => {
  const result = CatalogSearchSchema.parse({
    minPrice: 100,
    maxPrice: 25,
    page: -1,
    sort: "invalid",
  });
  assert.equal(result.minPrice, 25);
  assert.equal(result.maxPrice, 100);
  assert.equal(result.page, undefined);
  assert.equal(result.sort, undefined);
  assert.equal(CatalogSearchSchema.parse({ minPrice: "invalid" }).minPrice, undefined);
  assert.equal(CatalogRequestSchema.safeParse({ limit: 10000 }).success, false);
  assert.equal(CatalogRequestSchema.safeParse({ offset: -1 }).success, false);
  assert.equal(CatalogRequestSchema.safeParse({ minPrice: -5 }).success, false);
});
test("colour matching handles combined options and treats punctuation as literal data", () => {
  const filter = colorVariantFilter(["brown", "blue,white"], true);
  assert.ok(filter.includes('variant_value.ilike."brown / %"'));
  assert.ok(filter.includes('variant_value.ilike."blue,white"'));
  assert.ok(filter.includes("or(is_available.eq.true,is_available.is.null)"));
  assert.ok(filter.includes("or(stock_quantity.is.null,stock_quantity.gt.0)"));
  assert.equal(literalPattern("50%_blue"), "50\\%\\_blue");
  assert.ok(colorVariantFilter(['a"b']).includes('a\\"b'));
});
