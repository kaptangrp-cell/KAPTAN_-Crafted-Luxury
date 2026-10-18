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
