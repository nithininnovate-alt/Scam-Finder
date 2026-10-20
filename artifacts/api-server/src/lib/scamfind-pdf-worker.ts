import { parentPort, workerData } from "node:worker_threads";
import { getDocumentProxy } from "unpdf";

async function extract() {
  const options = {
    isEvalSupported: false, useSystemFonts: false, disableFontFace: true,
    useWorkerFetch: false, stopAtErrors: true, maxImageSize: 1000000,
  };
  const pdf = await getDocumentProxy(new Uint8Array(workerData), options);
  try {
    if (pdf.numPages > 20) throw new Error("page_limit");
    const pages: string[] = [];
    let chars = 0;
    let emptyPages = 0;
    // Never use extractText's unbounded Promise.all over attacker-chosen pages.
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
      if (text.length < 10) emptyPages++;
      const annotations = await page.getAnnotations({ intent: "display" });
      const links = annotations.map(item => item.url as unknown).filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
      const body = `${text}${links.length ? `\nLinked URLs:\n${Array.from(new Set(links)).join("\n")}` : ""}`;
      chars += body.length;
      if (chars > 200000) throw new Error("text_limit");
      pages.push(body);
      page.cleanup();
    }
    const text = pages.join("\n\n").trim();
    return { ok: true, text, pages: pdf.numPages, emptyPages, warning: `${emptyPages ? `${emptyPages} page(s) had little or no readable text. ` : ""}Only extractable text and link annotations were screened. Images within otherwise readable pages may also contain unscreened text. No OCR, signature validation, image authenticity or PDF malware analysis was performed. The original PDF is not retained.` };
  } finally { /* The parent terminates this bounded, single-use worker. */ }
}

extract().then(result => parentPort?.postMessage(result)).catch(error => {
  const code = ["page_limit", "text_limit", "image_only"].includes(error?.message) ? error.message : error?.name === "PasswordException" ? "password" : "unreadable";
  parentPort?.postMessage({ ok: false, code });
});
