import { createHash } from "node:crypto";
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
export function inspectDocument(base64: string, csv = false) {
  if (
    !base64 ||
    base64.length > (4 * MAX_DOCUMENT_BYTES) / 3 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new Error("Invalid file encoding or file exceeds 3 MB");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64 || !bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    throw new Error("File exceeds 3 MB");
  let mime: "application/pdf" | "image/png" | "image/jpeg" | "application/xml" | "text/csv";
  if (bytes.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
  else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    mime = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
  else if (csv) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("CSV must be UTF-8 text without null bytes");
    mime = "text/csv";
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!text.startsWith("<") || /<!DOCTYPE|<!ENTITY|<\s*html\b|<\s*script\b/i.test(text))
      throw new Error("Use PDF, PNG, JPEG or UTF-8 XML without external entities");
    // Preserved as evidence only: neither extraction nor invoice validation is claimed.
    mime = "application/xml";
  }
  return { bytes, mime, hash: createHash("sha256").update(bytes).digest("hex") };
}
