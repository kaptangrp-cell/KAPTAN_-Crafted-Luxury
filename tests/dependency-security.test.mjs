import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// GHSA-qx66-fv34-fjm8: check every locked copy, including nested dependencies.
test("TanStack Start lockfile excludes releases affected by the server-function XSS", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const [name, minimum] of Object.entries({
    "@tanstack/react-start": [1, 168, 60],
    "@tanstack/start-server-core": [1, 169, 39],
  })) {
    const entries = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`),
    );
    assert.ok(entries.length > 0, `${name} must be present in the lockfile`);
    for (const [path, entry] of entries) {
      assert.match(entry.version, /^\d+\.\d+\.\d+$/, `${path}: expected a stable release`);
      const parts = entry.version.split(".").map(Number);
      const difference = parts
        .map((part, index) => part - minimum[index])
        .find((part) => part !== 0);
      assert.ok(
        difference === undefined || difference > 0,
        `${path}@${entry.version} is vulnerable`,
      );
    }
  }
});
