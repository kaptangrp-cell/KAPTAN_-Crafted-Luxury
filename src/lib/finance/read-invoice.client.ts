import { invoiceHints } from './invoice-hints';

export async function readInvoiceLocally(base64: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined;
  const ocr = async (image: HTMLCanvasElement | Blob) => {
    if (!worker) {
      const {createWorker} = await import('tesseract.js');
      worker = await createWorker('deu+eng', 1, {
        workerPath: '/finance-ocr/worker.min.js', corePath: '/finance-ocr', langPath: '/finance-ocr',
      });
    }
    return (await worker.recognize(image)).data.text;
  };
  let text = '';
  try {
    if (mime === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      const {default: workerUrl} = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdfjs.getDocument({data: bytes, useSystemFonts: true});
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 15) throw new Error('Automatic reading supports up to 15 pages. Review this original manually.');
        for (let n=1; n<=pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          let pageText = '';
          let y: number | undefined;
          for (const item of content.items) {
            if (!('str' in item)) continue;
            if (y !== undefined && Math.abs(item.transform[5]-y)>3) pageText += '\n';
            pageText += item.str + (item.hasEOL ? '\n' : ' ');
            y = item.transform[5];
          }
          if (pageText.trim().length < 40) {
            const initial = page.getViewport({scale:1});
            const viewport = page.getViewport({scale:Math.min(2,2000/Math.max(initial.width,initial.height))});
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            await page.render({canvas, viewport}).promise;
            pageText = await ocr(canvas);
            canvas.width = canvas.height = 0;
          }
          text += '\n' + pageText;
          if (text.length > 100000) throw new Error('Too much text for automatic reading. Review manually.');
          page.cleanup();
        }
      } finally { await task.destroy(); }
    } else if (mime.startsWith('image/')) {
      // Bound image decoding/OCR dimensions before allocating OCR memory.
      const bitmap = await createImageBitmap(new Blob([bytes], {type:mime}));
      try {
        const scale = Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(bitmap.width*scale); canvas.height = Math.ceil(bitmap.height*scale);
        canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
        text = await ocr(canvas);
      } finally { bitmap.close(); }
    } else throw new Error('Use XML extraction or review this document manually.');
    return {hints: invoiceHints(text), text};
  } finally { await worker?.terminate(); }
}
