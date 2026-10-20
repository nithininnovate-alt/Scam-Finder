import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { extractOfferPdf } from "./scamfind-pdf";

const exec = promisify(execFile);
let dir: string;
let scanned: Buffer;
let mixed: Buffer;
let textPdf: Buffer;
const sentence = "Employment offer: Software Engineer. Contact the employer independently before accepting.";
const imageSentence = "Send a processing fee by gift cards today to secure this position.";

async function makePdf(draw: (pdf: PDFKit.PDFDocument) => void, options: PDFKit.PDFDocumentOptions = {}): Promise<Buffer> {
  const pdf = new PDFDocument({ margin: 50, ...options });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", chunk => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  draw(pdf);
  pdf.end();
  return done;
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "scamfind-pdf-tests-"));
  textPdf = await makePdf(pdf => pdf.fontSize(20).text(sentence));
  const imageSource = await makePdf(pdf => pdf.fontSize(24).text(imageSentence));
  await writeFile(join(dir, "source.pdf"), imageSource);
  await exec("pdftoppm", ["-scale-to", "1800", "-singlefile", "-png", join(dir, "source.pdf"), join(dir, "image")]);
  const png = await readFile(join(dir, "image.png"));
  scanned = await makePdf(pdf => pdf.image(png, 0, 0, { width: 612, height: 792 }));
  mixed = await makePdf(pdf => {
    pdf.fontSize(18).text(sentence);
    pdf.image(png, 0, 150, { width: 500, height: 600 });
    pdf.addPage().image(png, 0, 0, { width: 612, height: 792 });
  });
  // Optional fixture export for the one browser pass, always into an ignored directory.
  if (process.env.OCR_TEST_FIXTURES) {
    for (const [name, bytes] of [["scanned", scanned], ["mixed", mixed], ["text", textPdf]] as const) {
      await writeFile(join(process.env.OCR_TEST_FIXTURES, `${name}.pdf`), bytes);
    }
    await writeFile(join(process.env.OCR_TEST_FIXTURES, "corrupt.pdf"), Buffer.from("%PDF-1.7\nbroken"));
    const locked = await makePdf(pdf => pdf.text(sentence), { userPassword: "fixture-only", ownerPassword: "fixture-owner" });
    await writeFile(join(process.env.OCR_TEST_FIXTURES, "locked.pdf"), locked);
  }
});

after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

test("text-PDF path remains unchanged and does not require OCR tools", async () => {
  const path = process.env.PATH;
  process.env.PATH = "/nonexistent-ocr-test";
  try {
    const result = await extractOfferPdf(textPdf);
    assert.match(result.text, /Software Engineer/);
    assert.match(result.warning, /No OCR/);
  } finally { process.env.PATH = path; }
});

test("declining OCR on a scanned PDF fails explicitly", async () => {
  await assert.rejects(extractOfferPdf(scanned, false), /Enable optional local OCR/);
});

test("scanned PDF uses local OCR and cleans up transient page images", async () => {
  const beforeDirs = (await readdir(tmpdir())).filter(name => name.startsWith("scamfind-ocr-"));
  const result = await extractOfferPdf(scanned, true);
  assert.match(result.text, /processing fee/i);
  assert.match(result.warning, /1 of 1 page/);
  assert.match(result.warning, /No signature validation/);
  assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith("scamfind-ocr-")), beforeDirs);
});

test("mixed PDFs preserve text and read images on both text-bearing and scanned pages", async () => {
  const textOnly = await extractOfferPdf(mixed, false);
  assert.match(textOnly.text, /Software Engineer/);
  assert.doesNotMatch(textOnly.text, /processing fee/);
  assert.match(textOnly.warning, /1 page\(s\) had little/);
  const result = await extractOfferPdf(mixed, true);
  assert.match(result.text, /Software Engineer/);
  assert.match(result.text, /\[Local OCR page 1\]/);
  assert.match(result.text, /\[Local OCR page 2\]/);
  assert.match(result.text, /processing fee/i);
  assert.equal(result.pages, 2);
});

test("OCR engine failure preserves readable evidence with a partial warning; scanned-only fails", async () => {
  const path = process.env.PATH;
  process.env.PATH = "/nonexistent-ocr-test";
  try {
    const result = await extractOfferPdf(mixed, true);
    assert.match(result.text, /Software Engineer/);
    assert.match(result.warning, /PARTIAL EXTRACTION/);
    assert.match(result.warning, /0 of 2/);
    await assert.rejects(extractOfferPdf(scanned, true), /Local OCR found no usable text/);
  } finally { process.env.PATH = path; }
});

test("corrupt and password-protected PDFs fail before OCR", async () => {
  await assert.rejects(extractOfferPdf(Buffer.from("%PDF-1.7\nbroken"), true), /could not be read/);
  const locked = await makePdf(pdf => pdf.text(sentence), { userPassword: "fixture", ownerPassword: "fixture-owner" });
  await assert.rejects(extractOfferPdf(locked, true), /Password-protected/);
});

test("page and byte limits are enforced before OCR", async () => {
  const long = await makePdf(pdf => {
    for (let i = 0; i < 21; i++) {
      if (i) pdf.addPage();
      pdf.text(sentence);
    }
  });
  await assert.rejects(extractOfferPdf(long, true), /limited to 20 pages/);
  await assert.rejects(extractOfferPdf(Buffer.alloc(5 * 1024 * 1024 + 1), true), /limited to 5 MB/);
});
