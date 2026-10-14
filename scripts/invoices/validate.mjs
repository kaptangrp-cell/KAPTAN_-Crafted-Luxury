import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
export async function validateXml(xml) {
  const jar = process.env.KOSIT_JAR,
    config = process.env.KOSIT_CONFIG;
  if (!jar || !config)
    throw new Error("Configure the free local KoSIT validator before invoice issuance");
  const directory = await mkdtemp(join(tmpdir(), "kaptan-invoice-"));
  try {
    const path = join(directory, "invoice.xml");
    await writeFile(path, xml, { mode: 0o600 });
    // No shell interpolation; buyer text never becomes command-line code.
    let failure;
    try {
      await run(
        process.env.JAVA_BIN || "java",
        [
          "-Xmx512m",
          "-jar",
          resolve(jar),
          "-s",
          join(resolve(config), "scenarios.xml"),
          "-r",
          resolve(config),
          "-o",
          directory,
          path,
        ],
        { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (e) {
      failure = e;
    }
    const report = await readFile(join(directory, "invoice-report.xml"), "utf8").catch(() => null);
    if (!report)
      throw new Error(
        "KoSIT did not produce a validation report" +
          (failure ? ": check the Java runtime and configuration" : ""),
      );
    // Fail closed, including warnings. Keep the exact official report with the invoice.
    const accepted =
      /<rep:report\b[^>]*\bvalid="true"/.test(report) &&
      /<rep:accept[\s>]/.test(report) &&
      !/<svrl:failed-assert\b/.test(report);
    return {
      accepted,
      engine: "KoSIT Validator 1.6.3",
      configuration: "XRechnung 3.0.2 / 2026-08-31",
      report,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
