import { timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

export function authorized(header, secret) {
  if (typeof secret !== "string" || secret.length < 32 || typeof header !== "string") return false;
  const expected = Buffer.from("Bearer " + secret);
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createHandler({ env = process.env, run = execute } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const respond = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") return respond(405, { error: "POST required" });
    if (!authorized(req.headers.authorization, env.INVOICE_WORKER_SECRET))
      return respond(401, { error: "Unauthorized" });
    const mode = new URL(req.url, "https://worker.invalid").searchParams.get("mode");
    const scripts = {
      health: "scripts/invoices/serverless-health.mjs",
      invoices: "scripts/invoices/worker.mjs",
      incoming: "scripts/finance/validate-incoming.mjs",
    };
    if (!Object.hasOwn(scripts, mode)) return respond(400, { error: "Invalid mode" });
    if (mode !== "health" && env.INVOICE_SERVERLESS_ENABLED !== "true")
      return respond(503, { error: "Processing is not enabled" });
    try {
      await run(process.execPath, [join(root, scripts[mode])], {
        cwd: root,
        env: {
          ...env,
          JAVA_BIN: join(root, "runtime/java/bin/java"),
          KOSIT_JAR: join(root, "runtime/validator.jar"),
          KOSIT_CONFIG: join(root, "runtime/config"),
          INVOICE_BATCH_SIZE: "1",
          INVOICE_EMAIL_BATCH_SIZE: "3",
          INCOMING_BATCH_SIZE: "1",
          INVOICE_SERVERLESS_RUNTIME: "true",
        },
        timeout: 50000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
      });
      return respond(200, { completed: true, mode });
    } catch {
      // Never return child-process output, credentials, invoice XML or buyer details.
      console.error("Invoice worker pass failed", { mode });
      return respond(503, { error: "Worker pass failed; check queue and runtime configuration" });
    }
  };
}
export default createHandler();
