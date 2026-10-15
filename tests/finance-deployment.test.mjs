import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { inspectSchema } from "../scripts/finance/check-deployment.mjs";
test("deployment readiness requires all finance modules, not just the ledger", async () => {
  const absent = inspectSchema({ paths: { "/orders": {} } });
  assert.ok(absent.every((m) => m.missing.length > 0));
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const sql = (
    await Promise.all(
      (await readdir(dir))
        .filter((n) => n.includes("finance_"))
        .map((n) => readFile(new URL(n, dir), "utf8")),
    )
  ).join("\n");
  const functions = [
    ...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(finance_\w+)\(/g),
  ].map((m) => m[1]);
  const paths = Object.fromEntries(functions.map((f) => ["/rpc/" + f, {}]));
  assert.ok(inspectSchema({ paths }).every((m) => m.missing.length === 0));
  delete paths["/rpc/finance_asset_depreciate"];
  const assets = inspectSchema({ paths }).find((m) => m.module === "assets");
  assert.deepEqual(assets.missing, ["finance_asset_depreciate"]);
});
