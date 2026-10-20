import { Worker } from "node:worker_threads";
import { recognizeLocalPdf } from "./scamfind-ocr";

const messages: Record<string, string> = {
  page_limit: "PDFs are limited to 20 pages. Upload a shorter offer or paste the relevant text.",
  text_limit: "The extracted PDF text is too long. Upload a shorter offer or paste up to 200,000 characters.",
  image_only: "This PDF is image-only or has no readable text. Enable optional local OCR for this document, paste the offer text, or upload a text-based PDF.",
  password: "Password-protected PDFs cannot be read. Upload an unlocked copy that you are authorized to share, or paste the text.",
  unreadable: "This PDF could not be read. It may be damaged or unsupported. Try an unlocked text-based PDF or paste the text.",
};
let active = 0;
type PdfText = { text: string; pages: number; warning: string; emptyPages: number };
export async function extractOfferPdf(buffer: Buffer, localOcr = false): Promise<{ text: string; pages: number; warning: string }> {
  if (buffer.length > 5 * 1024 * 1024) throw new Error("PDF uploads are limited to 5 MB.");
  if (active >= 2) throw new Error("PDF processing is busy. Please try again shortly.");
  active++;
  try {
    const extracted = await new Promise<PdfText>((resolve, reject) => {
      const worker = new Worker(new URL("./pdf-worker.mjs", import.meta.url), {
        workerData: new Uint8Array(buffer), resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
      });
      let settled = false;
      const finish = (error?: Error, result?: PdfText) => {
        if (settled) return;
        settled = true; clearTimeout(timer); void worker.terminate();
        if (error) reject(error); else resolve(result!);
      };
      const timer = setTimeout(() => finish(new Error("PDF extraction timed out. Try a smaller text-based PDF or paste the offer text.")), 15000);
      worker.on("message", result => {
        if (!result?.ok) finish(new Error(messages[result?.code] ?? messages.unreadable));
        else finish(undefined, result);
      });
      worker.on("error", () => finish(new Error(messages.unreadable)));
      worker.on("exit", () => { if (!settled) finish(new Error(messages.unreadable)); });
    });
    const readable = extracted.text.length >= 30 && extracted.emptyPages < extracted.pages;
    if (!localOcr) {
      if (!readable) throw new Error(messages.image_only);
      return extracted;
    }
    let ocr;
    try { ocr = await recognizeLocalPdf(buffer, extracted.pages); }
    catch (error) {
      if (error instanceof Error && error.message === "text_limit") throw new Error(messages.text_limit);
      throw error;
    }
    const text = [extracted.text, ocr.text].filter(Boolean).join("\n\n");
    if (text.length > 200000) throw new Error(messages.text_limit);
    if (!readable && ocr.chars < 30) {
      throw new Error("Local OCR found no usable text or could not complete. Try a clearer English-language scan or paste the text. No case was saved.");
    }
    return { text, pages: extracted.pages,
      warning: `Local English OCR completed on ${ocr.completed} of ${extracted.pages} page(s). ${ocr.completed < extracted.pages ? `PARTIAL EXTRACTION: ${extracted.pages - ocr.completed} page(s) could not be OCR-processed; their image text was not screened. ` : ""}${ocr.completed - ocr.readablePages} processed page(s) yielded little or no recognized text. ${extracted.emptyPages} page(s) had little or no text-layer content. Text-layer evidence and any recognized image text were screened; overlapping text may appear twice. OCR can miss or misread text, especially handwriting, small print and other languages. Review the extracted evidence against your document. No signature validation, document authenticity or malware analysis was performed. Documents were processed locally, not sent to an external OCR service. Original bytes and temporary page images are not retained.` };
  } finally { active--; }
}
