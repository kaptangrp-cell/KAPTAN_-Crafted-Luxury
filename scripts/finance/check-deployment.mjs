import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modules = {
  ledger: ["finance_snapshot", "finance_submit", "finance_post"],
  documents: ["finance_document_reserve", "finance_expense_post"],
  banking: ["finance_bank_import"],
  costs: ["finance_shipment_post"],
  tax: ["finance_tax_review"],
  exports: ["finance_export"],
  automation: ["finance_automation_settings"],
  suppliers: ["finance_supplier_save", "finance_create_year"],
  validation: ["finance_validation_claim", "finance_validation_finish"],
  assets: ["finance_asset_register", "finance_asset_depreciate"],
};
export function inspectSchema(schema) {
  const paths = new Set(Object.keys(schema.paths ?? {}));
  return Object.entries(modules).map(([module, functions]) => ({
    module,
    missing: functions.filter((name) => !paths.has(`/rpc/${name}`)),
  }));
}
export async function checkDeployment(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and server-only service key are required");
  const target = new URL(url);
  if (target.protocol !== "https:" || !target.hostname.endsWith(".supabase.co"))
    throw new Error("Expected the configured HTTPS Supabase project URL");
  if (env.VITE_SUPABASE_URL && new URL(env.VITE_SUPABASE_URL).origin !== target.origin)
    throw new Error("Browser and server point to different databases; fix environment first");
  const config = await readFile(new URL("../../supabase/config.toml", import.meta.url), "utf8");
  const configured = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const project = target.hostname.split(".")[0];
  const response = await fetch(new URL("/rest/v1/", target), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Database schema inspection failed (HTTP ${response.status})`);
  const checks = inspectSchema(await response.json());
  const report = {
    project,
    configMatches: configured === project,
    modules: checks,
    schemaReady: checks.every((c) => c.missing.length === 0),
    note: "Read-only API schema inspection. Does not verify roles, worker operation, storage, backups or customer workflows.",
  };
  console.log(JSON.stringify(report, null, 2));
  return report.schemaReady && report.configMatches;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!(await checkDeployment())) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment check failed");
    process.exitCode = 1;
  }
}
