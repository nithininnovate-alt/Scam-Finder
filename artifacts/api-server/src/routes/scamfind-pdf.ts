import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { extractOfferPdf } from "../lib/scamfind-pdf";
import { analyse } from "../lib/scamfind-analysis";
import { getScans, insertScan } from "../lib/scamfind-store";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 7, fieldSize: 1024 } }).single("file");
router.post("/scans/pdf", rateLimit({ windowMs: 60000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }), (req, res, next) => {
  upload(req, res, error => {
    if (error) { res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "PDF uploads are limited to 5 MB." : "Upload one PDF file with valid fields." }); return; }
    next();
  });
}, async (req, res): Promise<void> => {
  const file = req.file;
  if (!file || !file.originalname.toLowerCase().endsWith(".pdf") || !file.buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    res.status(400).json({ error: "Upload a valid .pdf file, up to 5 MB." }); return;
  }
  if ((await getScans(res.locals.owner)).length >= 500) { res.status(409).json({ error: "Your account has reached 500 saved scans. Delete older scans to continue." }); return; }
  if (req.body.checkLinks !== undefined && !["true", "false"].includes(req.body.checkLinks)) { res.status(400).json({ error: "Choose whether to check links." }); return; }
  if (req.body.localOcr !== undefined && !["true", "false"].includes(req.body.localOcr)) { res.status(400).json({ error: "Choose whether to use local OCR." }); return; }
  if (req.body.checkPhone !== undefined && !["true", "false"].includes(req.body.checkPhone)) { res.status(400).json({ error: "Choose whether to check a phone number." }); return; }
  let extracted;
  try { extracted = await extractOfferPdf(file.buffer, req.body.localOcr === "true"); }
  catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Unable to extract PDF text." }); return; }
  const fileName = file.originalname.replace(/[\r\n\x00]/g, "").slice(0, 255);
  const parsed = CreateScanBody.safeParse({ text: extracted.text, sender: req.body.sender || undefined, title: req.body.title || undefined, fileName, source: "upload", checkLinks: req.body.checkLinks === "true",
    checkPhone: req.body.checkPhone === "true", phoneNumber: req.body.phoneNumber || undefined, phoneCountry: req.body.phoneCountry || undefined });
  if (!parsed.success || parsed.data.sender && !/^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.data.sender)) { res.status(400).json({ error: "Enter a valid sender email and title, or leave them blank." }); return; }
  const scan = await analyse(parsed.data);
  scan.pdfSource = { fileName, pages: extracted.pages, warning: extracted.warning };
  scan.timeline.unshift({ at: new Date().toISOString(), description: `Extracted text from ${extracted.pages} PDF page(s). Local OCR requested: ${req.body.localOcr === "true" ? "yes" : "no"}. Original PDF SHA-256: ${createHash("sha256").update(file.buffer).digest("hex")}. Original bytes are not retained. The main report hash covers the extracted text.` });
  await insertScan(res.locals.owner, scan);
  res.status(201).json(CreateScanResponse.parse(scan));
});
export default router;
