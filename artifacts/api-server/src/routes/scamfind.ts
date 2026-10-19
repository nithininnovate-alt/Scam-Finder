import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { CreateScanBody, CreateScanResponse, GetScanParams, GetScanResponse, UpdateScanBody, UpdateScanResponse, ListScansResponse, GetSummaryResponse, ListProvidersResponse } from "@workspace/api-zod";
import { personalSession } from "../middlewares/scamfind-session";
import { analyse } from "../lib/scamfind-analysis";
import { findScan, getScans, insertScan, removeScan, saveScan } from "../lib/scamfind-store";
import { providers } from "../lib/scamfind-enrichment";
import { sendReport } from "../lib/scamfind-report";
import { requireAccount } from "../middlewares/scamfind-account";
import accountsRouter from "./scamfind-accounts";
import adminRouter from "./scamfind-admin";
import { recordCaseUpdate } from "../lib/scamfind-admin";

const router = Router();
router.use(personalSession);
router.use(rateLimit({ windowMs: 60000, limit: 200, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many requests. Please wait a minute." } }));
const scanLimit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Screening limit reached. Please wait one minute before continuing." } });

router.get("/providers", (_req, res) => { res.json(ListProvidersResponse.parse(providers)); });
router.use(requireAccount);
router.use(accountsRouter);
router.use("/admin", adminRouter);

router.get("/scans", async (_req, res): Promise<void> => {
  res.json(ListScansResponse.parse(await getScans(res.locals.owner)));
});

router.get("/summary", async (_req, res): Promise<void> => {
  const scans = await getScans(res.locals.owner);
  res.json(GetSummaryResponse.parse({
    total: scans.length, flagged: scans.filter(s => s.verdict === "Likely scam" || s.verdict === "Suspicious").length,
    genuine: scans.filter(s => s.verdict === "Likely genuine").length,
    openCases: scans.filter(s => s.status !== "closed").length,
    averageDurationMs: scans.length ? Math.round(scans.reduce((n, s) => n + s.durationMs, 0) / scans.length) : 0,
    recent: scans.slice(0, 5),
  }));
});

router.post("/scans", scanLimit, async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.text.trim()) { res.status(400).json({ error: "Provide offer text (up to 200,000 characters) and valid field values." }); return; }
  if (parsed.data.sender && !/^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.data.sender.trim())) { res.status(400).json({ error: "Enter a valid sender email address or leave it blank." }); return; }
  if (parsed.data.fileName && !/\.(?:txt|html?|eml)$/i.test(parsed.data.fileName)) { res.status(400).json({ error: "Supported offer uploads are .txt, .html and .eml. Paste text from other formats." }); return; }
  const current = await getScans(res.locals.owner);
  if (current.length >= 500) { res.status(409).json({ error: "Your account has reached 500 saved scans. Delete older scans to continue." }); return; }
  let scan;
  try { scan = await analyse(parsed.data); }
  catch { res.status(400).json({ error: "Unable to read the offer. Paste readable message text or a valid .eml email." }); return; }
  await insertScan(res.locals.owner, scan);
  res.status(201).json(CreateScanResponse.parse(scan));
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid case ID." }); return; }
  const scan = await findScan(res.locals.owner, params.data.id);
  if (!scan) { res.status(404).json({ error: "This scan is unavailable in your account or has expired." }); return; }
  res.json(GetScanResponse.parse(scan));
});

router.patch("/scans/:id", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  const body = UpdateScanBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid case update." }); return; }
  const scan = await findScan(res.locals.owner, params.data.id);
  if (!scan) { res.status(404).json({ error: "Scan not found." }); return; }
  recordCaseUpdate(scan, body.data, `User ${res.locals.account.id}`);
  await saveScan(res.locals.owner, scan);
  res.json(UpdateScanResponse.parse(scan));
});

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid case ID." }); return; }
  const deleted = await removeScan(res.locals.owner, params.data.id);
  if (!deleted.length) { res.status(404).json({ error: "Scan not found." }); return; }
  res.status(204).end();
});

router.get("/scans/:id/report", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid case ID." }); return; }
  const scan = await findScan(res.locals.owner, params.data.id);
  if (!scan) { res.status(404).json({ error: "Scan not found." }); return; }
  sendReport(scan, res);
});

export default router;
