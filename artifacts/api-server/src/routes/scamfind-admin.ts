import { Router } from "express";
import { desc } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";
import {
  GetAdminSummaryResponse, ListAdminUsersResponse, ListAdminScansResponse,
  GetAdminScanParams, GetAdminScanResponse, UpdateAdminScanBody, UpdateAdminScanResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/scamfind-account";
import { adminCases, recordCaseUpdate } from "../lib/scamfind-admin";
import { saveReviewedScan, processEmailQueue } from "../lib/scamfind-email";
import { logger } from "../lib/logger";
import { sendReport } from "../lib/scamfind-report";

const router = Router();
router.use(requireAdmin);

router.get("/summary", async (_req, res): Promise<void> => {
  const cases = await adminCases();
  const users = await db.select({ id: accountsTable.id }).from(accountsTable);
  res.json(GetAdminSummaryResponse.parse({
    users: users.length, total: cases.length,
    flagged: cases.filter(c => ["Likely scam", "Suspicious"].includes(c.scan.verdict)).length,
    openCases: cases.filter(c => c.scan.status !== "closed").length,
    escalated: cases.filter(c => c.scan.status === "escalated").length,
    overdue: cases.filter(c => c.scan.status !== "closed" && Date.parse(c.scan.dueAt) < Date.now()).length,
    recent: cases.slice(0, 8),
  }));
});

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(accountsTable).orderBy(desc(accountsTable.createdAt));
  res.json(ListAdminUsersResponse.parse(users.map(user => ({ ...user, createdAt: user.createdAt.toISOString() }))));
});

router.get("/scans", async (_req, res): Promise<void> => {
  res.json(ListAdminScansResponse.parse(await adminCases()));
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const params = GetAdminScanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid case ID." }); return; }
  const [item] = await adminCases(params.data.id);
  if (!item) { res.status(404).json({ error: "Case not found or not available for account review." }); return; }
  res.json(GetAdminScanResponse.parse(item.scan));
});

router.patch("/scans/:id", async (req, res): Promise<void> => {
  const params = GetAdminScanParams.safeParse(req.params);
  const body = UpdateAdminScanBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid case update." }); return; }
  const [item] = await adminCases(params.data.id);
  if (!item) { res.status(404).json({ error: "Case not found." }); return; }
  const statusChanged = !!body.data.status && body.data.status !== item.scan.status;
  const noteChanged = body.data.notes !== undefined && body.data.notes !== item.scan.notes;
  recordCaseUpdate(item.scan, body.data, `Admin ${res.locals.account.id}`);
  await saveReviewedScan(item.ownerId, item.scan, statusChanged || noteChanged, noteChanged);
  void processEmailQueue().catch(() => logger.error("Email queue could not be processed"));
  res.json(UpdateAdminScanResponse.parse(item.scan));
});

router.get("/scans/:id/report", async (req, res): Promise<void> => {
  const params = GetAdminScanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid case ID." }); return; }
  const [item] = await adminCases(params.data.id);
  if (!item) { res.status(404).json({ error: "Case not found." }); return; }
  sendReport(item.scan, res);
});

export default router;
