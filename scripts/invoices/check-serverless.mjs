// Synthetic health check only; does not claim invoice jobs or send customer email.
const secret = process.env.INVOICE_WORKER_SECRET;
if (!secret || secret.length < 32)
  throw new Error("Configure the private INVOICE_WORKER_SECRET first");
const response = await fetch("https://www.kaptangrp.com/api/invoice-worker?mode=health", {
  method: "POST",
  headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
  body: "{}",
  signal: AbortSignal.timeout(60000),
  redirect: "error",
});
const result = await response.json().catch(() => null);
if (!response.ok || result?.completed !== true || result?.mode !== "health")
  throw new Error("Production worker health check failed (HTTP " + response.status + ")");
console.log("Production worker health check passed. No customer records or email were processed.");
