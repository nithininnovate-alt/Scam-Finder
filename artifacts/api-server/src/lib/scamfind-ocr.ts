import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// No network client, external service, or persistent document store is used.
// Native tools inherit hard address-space/CPU/file limits, not just JS heap limits.
function run(tool: string, args: string[], timeout: number, input?: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("bash", ["-c",
      'ulimit -c 0 && ulimit -v 524288 -t 20 -f 32768 || exit 1; exec "$@"', "local-ocr", tool, ...args],
    { timeout, killSignal: "SIGKILL", maxBuffer: 800000, env: { ...process.env, OMP_THREAD_LIMIT: "1" } },
    (error, stdout) => error ? reject(new Error("Local OCR could not complete.")) : resolve(stdout));
    child.stdin?.on("error", () => { /* Process failure is reported by execFile. */ });
    child.stdin?.end(input);
  });
}

let active = false;
export async function recognizeLocalPdf(buffer: Buffer, pages: number): Promise<{ text: string; completed: number; readablePages: number; chars: number }> {
  if (active) throw new Error("Local OCR is busy. Try again shortly or turn off OCR to screen only the text layer.");
  active = true;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "scamfind-ocr-"));
    const deadline = Date.now() + 120000;
    const results: string[] = [];
    let completed = 0;
    let chars = 0;
    for (let page = 1; page <= pages; page++) {
      if (deadline - Date.now() < 1000) break;
      const prefix = join(dir, "page");
      try {
        await run("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to", "2000", "-singlefile", "-png", "-", prefix],
          Math.min(15000, deadline - Date.now()), buffer);
        const text = (await run("tesseract", [`${prefix}.png`, "stdout", "-l", "eng"],
          Math.max(1, Math.min(15000, deadline - Date.now())))).trim();
        completed++;
        if (text.length >= 10) {
          chars += text.length;
          if (chars > 200000) throw new Error("text_limit");
          results.push(`[Local OCR page ${page}]\n${text}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "text_limit") throw error;
        // Preserve text-layer evidence and clearly report incomplete OCR.
        break;
      } finally {
        await rm(`${prefix}.png`, { force: true });
      }
    }
    return { text: results.join("\n\n"), completed, readablePages: results.length, chars };
  } finally {
    try { if (dir) await rm(dir, { recursive: true, force: true }); }
    finally { active = false; }
  }
}
