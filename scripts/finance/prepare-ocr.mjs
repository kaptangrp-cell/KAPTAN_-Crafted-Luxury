// Self-host all OCR assets. Invoice content never goes to an external OCR service.
import { mkdir, copyFile, readdir } from 'node:fs/promises';
const dest = new URL('../../public/finance-ocr/', import.meta.url);
await mkdir(dest, {recursive:true});
await copyFile(new URL('../../node_modules/tesseract.js/dist/worker.min.js', import.meta.url), new URL('worker.min.js', dest));
const core = new URL('../../node_modules/tesseract.js-core/', import.meta.url);
for (const file of await readdir(core)) {
  if (/^tesseract-core.*lstm\.(?:wasm\.js|wasm)$/.test(file)) await copyFile(new URL(file, core),new URL(file,dest));
}
for (const lang of ['deu','eng']) await copyFile(new URL(`../../node_modules/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`, import.meta.url),new URL(`${lang}.traineddata.gz`, dest));
