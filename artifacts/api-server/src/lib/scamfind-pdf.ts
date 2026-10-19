import { Worker } from "node:worker_threads";

const messages: Record<string, string> = {
  page_limit: "PDFs are limited to 20 pages. Upload a shorter offer or paste the relevant text.",
  text_limit: "The extracted PDF text is too long. Upload a shorter offer or paste up to 200,000 characters.",
  image_only: "This PDF is image-only or has no readable text. OCR is not available; paste the offer text or upload a text-based PDF.",
  password: "Password-protected PDFs cannot be read. Upload an unlocked copy that you are authorized to share, or paste the text.",
  unreadable: "This PDF could not be read. It may be damaged or unsupported. Try an unlocked text-based PDF or paste the text.",
};
let active = 0;
export async function extractOfferPdf(buffer: Buffer): Promise<{ text: string; pages: number; warning: string }> {
  if (active >= 2) throw new Error("PDF processing is busy. Please try again shortly.");
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./pdf-worker.mjs", import.meta.url), {
        workerData: new Uint8Array(buffer), resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
      });
      let settled = false;
      const finish = (error?: Error, result?: { text: string; pages: number; warning: string }) => {
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
  } finally { active--; }
}
