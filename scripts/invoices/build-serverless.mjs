import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, cp, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
const run = promisify(execFile);
if (process.env.KAPTAN_SERVERLESS_WORKER_BUILD !== "true" && !process.argv.includes("--prepare")) {
  console.log(
    "Invoice function packaging is opt-in; set KAPTAN_SERVERLESS_WORKER_BUILD=true after hosting review.",
  );
  process.exit(0);
}
const base = resolve(".vercel/output");
const root = join(base, "functions/api/invoice-worker.func");
await mkdir(root, { recursive: true });
const cache = resolve(".invoice-runtime-cache");
await mkdir(cache, { recursive: true });
const artifacts = [
  [
    "java.tar.gz",
    "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_linux_hotspot_21.0.12.1_1.tar.gz",
    "2413149700df0f7d440500a84a8f764c535f21e5a5e87d38328b64eec2c5b500",
  ],
  [
    "validator.jar",
    "https://repo1.maven.org/maven2/org/kosit/validator/1.6.3/validator-1.6.3-standalone.jar",
    "799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9",
  ],
  [
    "config.zip",
    "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip",
    "2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8",
  ],
];
for (const [name, url, expected] of artifacts) {
  const path = join(cache, name);
  let bytes = await readFile(path).catch(() => null);
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== expected) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error("Runtime download failed: " + name);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== expected)
      throw new Error("Runtime integrity check failed: " + name);
    await writeFile(path, bytes);
  }
}
await mkdir(join(root, "runtime/java"), { recursive: true });
await mkdir(join(root, "runtime/config"), { recursive: true });
await run("tar", [
  "-xzf",
  join(cache, "java.tar.gz"),
  "--strip-components=1",
  "-C",
  join(root, "runtime/java"),
]);
await run("unzip", ["-oq", join(cache, "config.zip"), "-d", join(root, "runtime/config")]);
await cp(join(cache, "validator.jar"), join(root, "runtime/validator.jar"));
for (const entry of [
  "scripts/invoices/serverless.mjs",
  "scripts/invoices/serverless-health.mjs",
  "scripts/invoices/worker.mjs",
  "scripts/finance/validate-incoming.mjs",
]) {
  await build({
    entryPoints: [entry],
    outfile: join(root, entry),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
  });
}
for (const asset of [
  "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
  "node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
  "public/kaptan-logo.png",
]) {
  await mkdir(join(root, asset, ".."), { recursive: true });
  await cp(asset, join(root, asset));
}
await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
await writeFile(
  join(root, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs24.x",
    handler: "scripts/invoices/serverless.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: true,
    maxDuration: 60,
  }),
);
async function size(path) {
  const s = await stat(path);
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const name of await readdir(path)) total += await size(join(path, name));
  return total;
}
const bytes = await size(root);
if (bytes > 220 * 1024 * 1024)
  throw new Error("Invoice function exceeds conservative 220 MiB bundle budget");
const configPath = join(base, "config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
config.routes = [
  { src: "^/api/invoice-worker$", dest: "/api/invoice-worker" },
  ...config.routes.filter((r) => r.src !== "^/api/invoice-worker$"),
];
await writeFile(configPath, JSON.stringify(config, null, 2));
console.log("Invoice function packaged:", (bytes / 1024 / 1024).toFixed(1), "MiB");
