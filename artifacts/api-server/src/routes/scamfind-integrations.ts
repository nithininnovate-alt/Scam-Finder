import { randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, accountsTable, emailDeliveriesTable, integrationSettingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/scamfind-account";
import { emailSettings, emailAvailability, verifiedRecipient, recentDeliveries, processEmailQueue } from "../lib/scamfind-email";
import { probeWebRisk, webRiskHealth } from "../lib/scamfind-webrisk";
import { probeNumverify } from "../lib/scamfind-numverify";
import { probeSerpApi } from "../lib/scamfind-serpapi";
import { probeAbuseIp } from "../lib/scamfind-abuseipdb";
import { logger } from "../lib/logger";
import { GetIntegrationSettingsResponse, UpdateIntegrationSettingsBody, UpdateNotificationPreferencesBody, GetNotificationPreferencesResponse, UpdateNumverifyLimitsBody } from "@workspace/api-zod";
import { numverifyUsage, updateNumverifyLimits } from "../lib/scamfind-numverify-quota";

const router = Router();
async function preferences(accountId: string) {
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  const settings = await emailSettings();
  let recipient: string | undefined;
  try { recipient = await verifiedRecipient(accountId); } catch { /* Expose unavailable verification, not a stale verified-address claim. */ }
  const ready = !!settings.senderEmail && settings.emailEnabled && !!recipient;
  return GetNotificationPreferencesResponse.parse({
    enabled: !!account?.emailAlerts, email: recipient ?? "", ready,
    message: !recipient ? "A verified primary email could not be confirmed. Verify your account email or try again later."
      : !ready ? "An administrator still needs to configure and enable a verified sending domain. Alerts remain off until then."
      : "Ready. Opt in to emails when a reviewer changes a case status or notes. Offer text and notes are never included.",
  });
}
router.get("/account/notifications", async (_req, res): Promise<void> => { res.json(await preferences(res.locals.account.id)); });
router.patch("/account/notifications", async (req, res): Promise<void> => {
  const body = UpdateNotificationPreferencesBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Choose whether to enable email alerts." }); return; }
  if (body.data.enabled) {
    const settings = await emailSettings();
    if (!settings.emailEnabled || !settings.senderEmail) { res.status(409).json({ error: "An administrator must enable a verified sender before you can opt in." }); return; }
    const recipient = await verifiedRecipient(res.locals.account.id);
    if (!recipient) { res.status(409).json({ error: "Verify your primary account email before enabling alerts." }); return; }
    await db.update(accountsTable).set({ email: recipient.toLowerCase() }).where(eq(accountsTable.id, res.locals.account.id));
  }
  await db.update(accountsTable).set({ emailAlerts: body.data.enabled }).where(eq(accountsTable.id, res.locals.account.id));
  res.json(await preferences(res.locals.account.id));
});

const admin = Router();
admin.use(requireAdmin);
const adminActions = rateLimit({ windowMs: 60000, limit: 3, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Please wait a minute before testing again." } });
async function settingsResponse() {
  const [settings, email, deliveries, usage] = await Promise.all([emailSettings(), emailAvailability(), recentDeliveries(), numverifyUsage()]);
  const risk = webRiskHealth();
  return GetIntegrationSettingsResponse.parse({
    ...settings, emailStatus: email.status, emailMessage: email.message,
    deliveryTrackingConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
    webRiskStatus: risk.status, webRiskMessage: risk.message, deliveries, numverifyUsage: usage,
  });
}
admin.get("/", async (_req, res): Promise<void> => { res.json(await settingsResponse()); });
admin.patch("/numverify-limits", async (req, res): Promise<void> => {
  const body = UpdateNumverifyLimitsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter daily and monthly limits as whole numbers from 0 to 2147483647." }); return; }
  res.json(await updateNumverifyLimits(body.data));
});
admin.patch("/", async (req, res): Promise<void> => {
  const body = UpdateIntegrationSettingsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter valid sender settings." }); return; }
  const email = body.data.senderEmail.trim().toLowerCase();
  const name = body.data.senderName.trim();
  if (!name || /[\r\n<>]/.test(name) || email && !/^[^\s<>@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || body.data.emailEnabled && !email) {
    res.status(400).json({ error: "Enter a sender name and an email address on a domain verified in Resend." }); return;
  }
  const settings = { senderEmail: email, senderName: name, emailEnabled: body.data.emailEnabled, updatedAt: new Date() };
  await db.insert(integrationSettingsTable).values({ id: "main", ...settings }).onConflictDoUpdate({ target: integrationSettingsTable.id, set: settings });
  res.json(await settingsResponse());
});
admin.post("/check", adminActions, async (_req, res): Promise<void> => {
  await Promise.all([probeWebRisk(true), probeNumverify(true), probeSerpApi(true), probeAbuseIp(true)]); res.json(await settingsResponse());
});
admin.post("/test-email", adminActions, async (_req, res): Promise<void> => {
  const settings = await emailSettings();
  if (!settings.senderEmail) { res.status(409).json({ error: "Save a sender address from a verified domain first." }); return; }
  const recipient = await verifiedRecipient(res.locals.account.id);
  if (!recipient) { res.status(409).json({ error: "Verify your primary email address before sending a test." }); return; }
  const id = randomUUID();
  await db.insert(emailDeliveriesTable).values({ id, accountId: res.locals.account.id, type: "test", recipient });
  res.status(202).json({ id, type: "test", status: "queued", createdAt: new Date().toISOString(), attempts: 0, recipient, error: "", deliveryState: "unconfirmed", deliveryEventAt: "" });
  void processEmailQueue().catch(() => logger.error("Email queue could not be processed"));
});
router.use("/admin/integrations", admin);
export default router;
