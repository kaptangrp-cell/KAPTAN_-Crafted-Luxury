import test from "node:test";
import assert from "node:assert/strict";
import { collectionForCategory } from "../src/lib/catalog-collections.ts";
import { CatalogSearchSchema, CatalogRequestSchema } from "../src/lib/catalog-filters.ts";
import { moveMedia } from "../src/lib/media-order.ts";

test("legacy catalogue families map into the two storefront collections", () => {
  for (const name of [
    "Kaptan Everyday",
    "Kaptan Work",
    "Kaptan Women",
    "Leather bags",
    "Lederwaren",
  ])
    assert.equal(collectionForCategory({ name }), "leather");
  for (const name of ["Himalayan Premium", "Salt Lamps", "Salzlampen"])
    assert.equal(collectionForCategory({ name }), "salt");
  assert.equal(collectionForCategory({ name: "Unclassified" }), null);
  assert.equal(CatalogSearchSchema.parse({ collection: "salt" }).collection, "salt");
  assert.equal(CatalogSearchSchema.parse({ collection: "invalid" }).collection, undefined);
  assert.equal(CatalogRequestSchema.safeParse({ collection: "invalid" }).success, false);
});

test("reordering and making a cover preserve media metadata without mutating the draft", () => {
  const original = [
    { url: "a", sort_order: 0 },
    { url: "b", sort_order: 1 },
    { url: "c", sort_order: 2 },
  ];
  const cover = moveMedia(original, 2, 0);
  assert.deepEqual(
    cover.map((x) => x.url),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    cover.map((x) => x.sort_order),
    [0, 1, 2],
  );
  assert.deepEqual(
    original.map((x) => x.url),
    ["a", "b", "c"],
  );
  assert.deepEqual(moveMedia(cover, 0, 2), original);
  assert.equal(moveMedia(original, -1, 0), original);
  assert.equal(moveMedia(original, 0, 9), original);
});
