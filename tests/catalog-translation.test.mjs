import test from "node:test";
import assert from "node:assert/strict";
import { translateCatalogText } from "../src/lib/catalog-translation.ts";

test("catalogue follows language changes without altering English merchant text", () => {
  const source = "KAPTAN Classic Leather Belt ";
  assert.equal(translateCatalogText(source, "de-DE"), "KAPTAN Klassischer Ledergürtel");
  assert.equal(translateCatalogText(source, "en"), source);
  assert.equal(translateCatalogText(source, "de"), "KAPTAN Klassischer Ledergürtel");
});
test("multiline care instructions preserve breaks and translate every known line", () => {
  assert.equal(
    translateCatalogText("Care Instructions\n\n- Disconnect from power before cleaning.", "de"),
    "Pflegehinweise\n\n- Vor der Reinigung vom Stromnetz trennen.",
  );
  assert.equal(translateCatalogText("Black, Brown", "de"), "Schwarz, Braun");
  assert.equal(translateCatalogText("11.43 × 6.35 cm", "de"), "11,43 × 6,35 cm");
});
test("unknown or changed merchant claims are never replaced by an unrelated translation", () => {
  assert.equal(
    translateCatalogText("New specification not reviewed", "de"),
    "New specification not reviewed",
  );
  assert.equal(translateCatalogText(null, "de"), "");
});

test("new leather names, colours and compound options translate without changing sizes", () => {
  assert.equal(
    translateCatalogText("KAPTAN Leather Laptop Bag", "de"),
    "KAPTAN Leder-Laptoptasche",
  );
  assert.equal(translateCatalogText("KAPTAN Leather Card Holder", "de"), "KAPTAN Leder-Kartenetui");
  assert.equal(translateCatalogText("Plum / One size", "de"), "Pflaume / Einheitsgröße");
  assert.equal(translateCatalogText("Black Jet / 32", "de"), "Tiefschwarz / 32");
  assert.equal(translateCatalogText("lemon / One size", "de-DE"), "Zitronengelb / Einheitsgröße");
  assert.equal(translateCatalogText("Coffee, Blue", "de"), "Kaffeebraun, Blau");
  assert.equal(translateCatalogText("Lemon / One size", "en"), "Lemon / One size");
});

test("English and German UI resources have matching keys and interpolation variables", async () => {
  const { readFile } = await import("node:fs/promises");
  const flatten = (value, prefix = "", result = {}) => {
    for (const [key, entry] of Object.entries(value)) {
      if (entry && typeof entry === "object") flatten(entry, `${prefix}${key}.`, result);
      else result[`${prefix}${key}`] = entry;
    }
    return result;
  };
  const en = flatten(
    JSON.parse(await readFile(new URL("../src/lib/i18n/en.json", import.meta.url))),
  );
  const de = flatten(
    JSON.parse(await readFile(new URL("../src/lib/i18n/de.json", import.meta.url))),
  );
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const key of Object.keys(en)) {
    assert.ok(de[key].trim(), `Empty German translation: ${key}`);
    assert.deepEqual(
      [...en[key].matchAll(/{{\s*([^}]+)\s*}}/g)].map((x) => x[1]).sort(),
      [...de[key].matchAll(/{{\s*([^}]+)\s*}}/g)].map((x) => x[1]).sort(),
      key,
    );
  }
});
