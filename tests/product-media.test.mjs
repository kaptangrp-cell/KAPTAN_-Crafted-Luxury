import test from "node:test";
import assert from "node:assert/strict";
import { colorHex, galleryForColor, mediaDetails } from "../src/lib/product-media.ts";
const images = [
  { url: "shared", sort_order: 0 },
  { url: "brown-back", sort_order: 2 },
  { url: "black", sort_order: 3 },
  { url: "brown-front", sort_order: 1 },
];
const specifications = {
  _media: [
    { url: "brown-front", color: "Brown", view: "Front", alt: "Brown bag front" },
    { url: "brown-back", color: "Brown", view: "Back", alt: "" },
    { url: "black", color: "Black", view: "Front", alt: "" },
  ],
};
test("catalogue colours have distinct swatches instead of the beige placeholder", () => {
  const colours = [
    "Plum",
    "Coffee",
    "Cognac",
    "Blue",
    "Black",
    "Brown",
    "Gray",
    "White",
    "Pink Natural",
  ];
  const swatches = colours.map(colorHex);
  assert.ok(swatches.every((swatch) => /^#[0-9a-f]{6}$/i.test(swatch)));
  assert.equal(new Set(swatches).size, colours.length);
  assert.equal(colorHex("  PLUM  "), colorHex("Plum"));
  assert.equal(colorHex("Pink   Natural"), colorHex("Pink Natural"));
  assert.equal(colorHex("Blau"), colorHex("Blue"));
  assert.equal(colorHex("Pflaume"), colorHex("Plum"));
  assert.equal(colorHex("Grey"), colorHex("Gray"));
  // An unconfigured colour must not masquerade as a brown product.
  assert.equal(colorHex("Unknown colour"), "transparent");
});
test("colour galleries show matching ordered views followed by shared media", () => {
  assert.deepEqual(
    galleryForColor(images, specifications, "brown").map((i) => i.url),
    ["brown-front", "brown-back", "shared"],
  );
  assert.deepEqual(
    galleryForColor(images, specifications, "Black").map((i) => i.url),
    ["black", "shared"],
  );
  assert.deepEqual(
    galleryForColor(images, specifications, "Red").map((i) => i.url),
    ["shared"],
  );
  assert.equal(images[1].url, "brown-back");
});
test("legacy products retain their ordered gallery; malformed metadata is ignored", () => {
  assert.equal(mediaDetails(null).length, 0);
  assert.equal(mediaDetails({ _media: [null, 3, { url: "bad" }] }).length, 0);
  assert.deepEqual(
    galleryForColor(images, {}, "Brown").map((i) => i.url),
    ["shared", "brown-front", "brown-back", "black"],
  );
  assert.equal(
    galleryForColor(
      images.filter((i) => i.url !== "shared"),
      specifications,
      "Red",
    ).length,
    0,
  );
});

test("Jet Black and Lemon swatches support merchant names and German labels", () => {
  assert.equal(colorHex("Black Jet"), "#0a0a0a");
  assert.equal(colorHex("Jet Black"), colorHex("Tiefschwarz"));
  assert.equal(colorHex("Lemon"), "#f4e64b");
  assert.equal(colorHex("Lemon Yellow"), colorHex("Zitronengelb"));
});
