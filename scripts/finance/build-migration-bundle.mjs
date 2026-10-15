import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export async function buildBundle() {
  const root = new URL("../../supabase/migrations/", import.meta.url);
  const names = (await readdir(root)).filter((n) => /^20261015\d+_finance_.*\.sql$/.test(n)).sort();
  if (names.length !== 13) throw new Error("Review migration range before generating bundle");
  const body = [];
  for (const name of names) {
    const sql = await readFile(new URL(name, root), "utf8");
    if (!/^BEGIN;\s/.test(sql) || !/COMMIT;\s*$/.test(sql))
      throw new Error("Unexpected migration wrapper: " + name);
    body.push("-- " + name + "\n" + sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""));
  }
  const versions = names.map((n) => n.split("_")[0]);
  return `-- KAPTAN finance: initial installation only. Target project rmglhfoteozmstsprlnq.
-- One atomic transaction; aborts if finance already exists. No existing order/stock values are edited.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('kaptan-finance-install',0));
DO $preflight$ BEGIN
 IF to_regclass('public.finance_journals') IS NOT NULL THEN RAISE EXCEPTION 'Finance already exists: use incremental migrations, not initial bundle'; END IF;
 IF to_regclass('public.invoices') IS NULL OR to_regclass('public.inventory_units') IS NULL THEN RAISE EXCEPTION 'Existing invoice and warehouse migrations required'; END IF;
END $preflight$;
${body.join("\n")}
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
${names.map((n, i) => "('" + versions[i] + "','" + n.slice(15, -4) + "')").join(",\n")};
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'Finance migrations installed' AS result;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = new URL("../../deploy/finance/initial-install.sql", import.meta.url);
  await mkdir(new URL("../../deploy/finance/", import.meta.url), { recursive: true });
  await writeFile(target, await buildBundle());
  console.log("Created deploy/finance/initial-install.sql");
}
