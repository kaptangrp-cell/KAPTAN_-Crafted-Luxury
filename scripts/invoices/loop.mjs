import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
let stopping = false,
  child;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
while (!stopping) {
  for (const script of [
    "scripts/invoices/worker.mjs",
    ...(process.env.FINANCE_VALIDATION_ENABLED === "true"
      ? ["scripts/finance/validate-incoming.mjs"]
      : []),
  ]) {
    if (stopping) break;
    await new Promise((resolve) => {
      child = spawn(process.execPath, [script], { stdio: "inherit" });
      child.on("error", () => {
        console.error("Invoice worker could not start");
        resolve();
      });
      child.on("exit", (code) => {
        if (code)
          console.error(
            "Invoice worker exited unsuccessfully; inspect configuration and admin queue",
          );
        resolve();
      });
    });
  }
  if (!stopping) await setTimeout(60000);
}
