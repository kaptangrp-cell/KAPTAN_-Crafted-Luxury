import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { formatEuro } from "../src/lib/currency.ts";

const en = JSON.parse(readFileSync(new URL("../src/lib/i18n/en.json", import.meta.url)));
const de = JSON.parse(readFileSync(new URL("../src/lib/i18n/de.json", import.meta.url)));
function flatten(object, prefix = "") {
  return Object.fromEntries(
    Object.entries(object).flatMap(([key, value]) =>
      typeof value === "object" && value !== null
        ? Object.entries(flatten(value, `${prefix}${key}.`))
        : [[`${prefix}${key}`, value]],
    ),
  );
}
const english = flatten(en);
const german = flatten(de);
test("English and German have matching translation keys and interpolation values", () => {
  assert.deepEqual(Object.keys(german).sort(), Object.keys(english).sort());
  for (const [key, value] of Object.entries(english)) {
    assert.equal(typeof german[key], "string", key);
    assert.ok(german[key].trim(), key);
    assert.deepEqual(
      [...value.matchAll(/{{\s*([^}]+)\s*}}/g)].map((m) => m[1]).sort(),
      [...german[key].matchAll(/{{\s*([^}]+)\s*}}/g)].map((m) => m[1]).sort(),
      key,
    );
  }
});
test("static translation references resolve, including plurals", () => {
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(path)) continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "t" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          assert.ok(
            key.split(".").reduce((value, part) => value?.[part], en) !== undefined ||
              english[`${key}_other`] !== undefined,
            `${path}: ${key}`,
          );
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  walk("src");
});
test("prices stay in euro without conversion across languages and legacy currency values", () => {
  for (const language of ["en", "de", "USD", "en-US", "pl"]) {
    const result = formatEuro(29.99, language);
    assert.ok(result.includes("€"));
    assert.match(result, /29[.,]99/);
    assert.doesNotMatch(result, /\$|£/);
  }
  assert.equal(formatEuro(0, "de"), "0,00 €");
});
