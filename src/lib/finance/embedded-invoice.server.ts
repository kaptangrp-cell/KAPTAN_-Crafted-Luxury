import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  PDFString,
  PDFHexString,
} from "pdf-lib";
import { inflateSync } from "node:zlib";
/** Extract supported embedded XML without executing PDF actions or contacting external resources. */
export async function embeddedInvoice(bytes: Uint8Array) {
  if (bytes.byteLength > 3 * 1024 * 1024) throw new Error("PDF exceeds 3 MB");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const specs: PDFDict[] = [];
  const add = (x: unknown) => {
    if (x instanceof PDFDict && !specs.includes(x)) specs.push(x);
    if (specs.length > 30) throw new Error("Too many PDF attachments");
  };
  const af = pdf.catalog.lookup(PDFName.of("AF"));
  if (af instanceof PDFArray) for (let i = 0; i < af.size(); i++) add(af.lookup(i));
  const names = pdf.catalog.lookup(PDFName.of("Names"));
  const tree = names instanceof PDFDict ? names.lookup(PDFName.of("EmbeddedFiles")) : null;
  const seen = new Set<PDFDict>();
  function walk(node: unknown, depth = 0) {
    if (!(node instanceof PDFDict)) return;
    if (depth > 8 || seen.has(node)) throw new Error("Invalid attachment name tree");
    seen.add(node);
    const entries = node.lookup(PDFName.of("Names"));
    if (entries instanceof PDFArray) {
      if (entries.size() > 60) throw new Error("Too many attachments");
      for (let i = 1; i < entries.size(); i += 2) add(entries.lookup(i));
    }
    const kids = node.lookup(PDFName.of("Kids"));
    if (kids instanceof PDFArray) {
      if (kids.size() > 30) throw new Error("Too many attachment branches");
      for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i), depth + 1);
    }
  }
  walk(tree);
  const candidates: Uint8Array[] = [];
  for (const spec of specs) {
    const rawName = spec.lookup(PDFName.of("UF")) ?? spec.lookup(PDFName.of("F"));
    const filename =
      rawName instanceof PDFString || rawName instanceof PDFHexString ? rawName.decodeText() : "";
    if (!/^(factur-x|zugferd-invoice|xrechnung)\.xml$/i.test(filename)) continue;
    const ef = spec.lookup(PDFName.of("EF"));
    const stream =
      ef instanceof PDFDict ? (ef.lookup(PDFName.of("UF")) ?? ef.lookup(PDFName.of("F"))) : null;
    if (!(stream instanceof PDFRawStream)) throw new Error("Missing embedded XML stream");
    const filter = stream.dict.lookup(PDFName.of("Filter"));
    if (stream.dict.has(PDFName.of("DecodeParms")))
      throw new Error("Unsupported embedded XML decode parameters");
    let xml: Uint8Array;
    if (!filter) xml = stream.getContents();
    else if (filter instanceof PDFName && filter.asString() === "/FlateDecode")
      xml = inflateSync(stream.getContents(), { maxOutputLength: 3 * 1024 * 1024 });
    else throw new Error("Unsupported embedded XML compression");
    if (xml.length > 3 * 1024 * 1024) throw new Error("Embedded XML exceeds 3 MB");
    candidates.push(xml);
  }
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "Ambiguous embedded invoice XML"
        : "No recognized embedded invoice XML; use manual review or upload XML separately",
    );
  return new TextDecoder("utf-8", { fatal: true }).decode(candidates[0]);
}
