import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Run on macOS or Linux with Node 24 and network access. Never deploys or migrates.
const root = fileURLToPath(new URL("../", import.meta.url));
const readJSON = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
let workspace;

function run(command, args, cwd, env = process.env) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal ?? result.status})`);
}

try {
  assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node.js 24 for this check.");
  const manifest = readJSON("package.json");
  const lock = readJSON("package-lock.json");
  const vercel = readJSON("vercel.json");
  assert.match(manifest.packageManager, /^npm@\d+\.\d+\.\d+$/);
  const npmPackage = manifest.packageManager;
  assert.equal(vercel.installCommand, `npx --yes ${npmPackage} ci`);
  assert.equal(vercel.buildCommand, "npm run build");
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"])
    assert.deepEqual(
      manifest[section] ?? {},
      lock.packages[""][section] ?? {},
      `${section} differs from lockfile`,
    );

  // Include current uncommitted work, but exclude ignored files and local secrets.
  const listing = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.equal(listing.status, 0, "Run this script from a Git checkout.");
  workspace = mkdtempSync(join(tmpdir(), "kaptan-release-check-"));
  for (const name of new Set(listing.stdout.split("\0").filter(Boolean))) {
    if (
      name
        .split("/")
        .some(
          (part) =>
            part.startsWith(".env") ||
            [".git", "node_modules", ".vercel", ".npmrc", ".dev.vars"].includes(part),
        )
    )
      continue;
    const source = join(root, name);
    const target = join(workspace, name);
    assert.ok(!relative(workspace, target).startsWith(".."), "Invalid file path");
    mkdirSync(dirname(target), { recursive: true });
    try {
      copyFileSync(source, target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error; // Uncommitted deletion.
    }
  }

  // The build needs public placeholders only; no real provider/database credentials.
  const env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SystemRoot"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    CI: "true",
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "ci-placeholder",
  });
  console.log(`Validating a clean copy at ${workspace}`);
  run("npx", ["--yes", npmPackage, "ci"], workspace, env);
  run("npx", ["--yes", npmPackage, "run", "check"], workspace, env);
  const output = JSON.parse(readFileSync(join(workspace, ".vercel/output/config.json"), "utf8"));
  assert.equal(output.version, 3, "Expected Vercel Build Output API v3 output");
  rmSync(workspace, { recursive: true, force: true });
  console.log("\nPASS: clean install, types, lint, regression tests, and Vercel production build.");
  console.log(
    "This does not verify a hosted deployment, live database migration, or real payments.",
  );
} catch (error) {
  console.error(`\nFAIL: ${error.message}`);
  if (workspace) console.error(`Temporary files retained for diagnosis: ${workspace}`);
  process.exitCode = 1;
}
