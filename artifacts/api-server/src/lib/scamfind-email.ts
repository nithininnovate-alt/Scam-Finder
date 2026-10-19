import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db, accountsTable, emailDeliveriesTable, integrationSettingsTable, scansTable } from "@workspace/db";
import { encrypt } from "./scamfind-crypto";
import type { Scan } from "./scamfind-analysis";

export async function emailSettings() {
  const [settings] = await db.select().from(integrationSettingsTable).where(eq(integrationSettingsTable.id, "main"));
  return settings ?? { senderEmail: "", senderName: "ScamFind", emailEnabled: false };
}

export async function verifiedRecipient(accountId: string) {
  const identity = await clerkClient.users.getUser(accountId);
  const primary = identity.emailAddresses.find(email => email.id === identity.primaryEmailAddressId);
  return primary?.verification?.status === "verified" ? primary.emailAddress : undefined;
}

export async function emailAvailability() {
  const settings = await emailSettings();
  if (!settings.senderEmail) return { status: "not_connected" as const, message: "Resend is connected. An administrator must save a sender address on a verified sending domain." };
  if (!settings.emailEnabled) return { status: "configured" as const, message: "Sender configured; automatic case-update alerts are switched off. Administrators can send a test email." };
  const [last] = await db.select().from(emailDeliveriesTable).where(inArray(emailDeliveriesTable.status, ["sent", "failed"])).orderBy(desc(emailDeliveriesTable.updatedAt)).limit(1);
  if (last?.status === "failed") return { status: "error" as const, message: last.error || "The most recent email attempt failed. Review delivery attempts." };
  return last?.status === "sent"
    ? { status: "active" as const, message: "Resend accepted a recent email. Case-update alerts are sent only to users who opt in; acceptance is not proof of inbox delivery." }
    : { status: "configured" as const, message: "Sender configured; send a test to confirm access. The sender domain must be verified in Resend." };
}

export async function recentDeliveries() {
  const rows = await db.select({ job: emailDeliveriesTable, email: accountsTable.email }).from(emailDeliveriesTable)
    .innerJoin(accountsTable, eq(accountsTable.id, emailDeliveriesTable.accountId))
    .orderBy(desc(emailDeliveriesTable.createdAt)).limit(20);
  return rows.map(({ job, email }) => ({
    id: job.id, type: job.type, status: job.status, createdAt: job.createdAt.toISOString(),
    attempts: job.attempts, recipient: job.recipient || email, error: job.error,
  }));
}

// Store the case edit and outbox event together: a mail outage cannot lose an
// already-saved review or turn a failed edit into a misleading notification.
export async function saveReviewedScan(ownerId: string, scan: Scan, changed: boolean, noteChanged: boolean) {
  await db.transaction(async tx => {
    const expiresAt = new Date(Date.parse(scan.createdAt) + (scan.status === "escalated" ? 730 : 90) * 86400000);
    const updated = await tx.update(scansTable).set({ encrypted: encrypt(scan), expiresAt })
      .where(and(eq(scansTable.owner, `account:${ownerId}`), eq(scansTable.id, scan.id))).returning({ id: scansTable.id });
    if (!updated.length) throw new Error("Case no longer available");
    const [account] = await tx.select().from(accountsTable).where(eq(accountsTable.id, ownerId));
    const [settings] = await tx.select().from(integrationSettingsTable).where(eq(integrationSettingsTable.id, "main"));
    if (changed && account?.emailAlerts && settings?.emailEnabled && settings.senderEmail) {
      await tx.insert(emailDeliveriesTable).values({ id: randomUUID(), accountId: ownerId, type: "case_update", caseId: scan.id, caseStatus: scan.status, noteChanged });
    }
  });
}

let processing = false;
export async function processEmailQueue() {
  if (processing) return;
  processing = true;
  try {
    await db.update(emailDeliveriesTable).set({ status: "queued", error: "A previous attempt was interrupted; retrying.", nextAttemptAt: new Date() })
      .where(and(eq(emailDeliveriesTable.status, "sending"), lt(emailDeliveriesTable.updatedAt, new Date(Date.now() - 300000))));
    for (let i = 0; i < 5; i++) {
      const job = await db.transaction(async tx => {
        const [next] = await tx.select().from(emailDeliveriesTable).where(and(
          eq(emailDeliveriesTable.status, "queued"), lte(emailDeliveriesTable.nextAttemptAt, new Date()),
        )).orderBy(emailDeliveriesTable.createdAt).limit(1).for("update", { skipLocked: true });
        if (!next) return;
        const [claimed] = await tx.update(emailDeliveriesTable).set({ status: "sending", attempts: sql`${emailDeliveriesTable.attempts} + 1`, updatedAt: new Date() })
          .where(eq(emailDeliveriesTable.id, next.id)).returning();
        return claimed;
      });
      if (!job) break;
      const settings = await emailSettings();
      const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, job.accountId));
      const cancel = async (error: string) => {
        await db.update(emailDeliveriesTable).set({ status: "cancelled", error, updatedAt: new Date() }).where(eq(emailDeliveriesTable.id, job.id));
      };
      if (!account || !settings.senderEmail || job.type === "case_update" && (!settings.emailEnabled || !account.emailAlerts)) {
        await cancel("Alerts were disabled or the account/sender is unavailable."); continue;
      }
      if (job.type === "case_update") {
        const [scan] = await db.select({ id: scansTable.id }).from(scansTable).where(and(eq(scansTable.id, job.caseId), eq(scansTable.owner, `account:${job.accountId}`)));
        if (!scan) { await cancel("The case was deleted before delivery."); continue; }
      }
      try {
        const recipient = await verifiedRecipient(job.accountId);
        if (!recipient) { await cancel("No verified primary email address is available."); continue; }
        await db.update(emailDeliveriesTable).set({ recipient }).where(eq(emailDeliveriesTable.id, job.id));
        const text = job.type === "test"
          ? "This is your ScamFind test email. Your configured sender successfully reached the email service. No job-offer data is included."
          : `A ScamFind reviewer updated one of your cases.\n\nStatus: ${job.caseStatus}${job.noteChanged ? "\nReview notes were updated." : ""}\n\nSign in to ScamFind and open your cases to read the update. No offer text, documents or notes are included in this email.`;
        // Instantiate fresh so credential refresh remains handled by the SDK.
        const request = new ReplitConnectors().proxy("resend", "/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": job.id, "User-Agent": "ScamFind" },
          body: { from: `${settings.senderName} <${settings.senderEmail}>`, to: [recipient], subject: job.type === "test" ? "ScamFind — test email" : "ScamFind — a reviewer updated your case", text },
        });
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const response = await Promise.race([request, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Email request timed out")), 15000); })]).finally(() => { if (timeout) clearTimeout(timeout); });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const error = [401, 403, 422].includes(response.status)
            ? "Resend rejected the sender or sending permission. Verify the sender domain and connection."
            : response.status === 429 ? "Email rate or account quota limit reached." : "Email service rejected this attempt.";
          await db.update(emailDeliveriesTable).set({
            status: retryable && job.attempts < 4 ? "queued" : "failed", error, updatedAt: new Date(),
            nextAttemptAt: new Date(Date.now() + Math.min(900000, 30000 * 2 ** job.attempts)),
          }).where(eq(emailDeliveriesTable.id, job.id));
          continue;
        }
        const body = await response.json() as { id?: string };
        if (typeof body.id !== "string") throw new Error("Missing email identifier");
        await db.update(emailDeliveriesTable).set({ status: "sent", providerId: body.id, error: "", updatedAt: new Date() }).where(eq(emailDeliveriesTable.id, job.id));
      } catch {
        await db.update(emailDeliveriesTable).set({
          status: job.attempts < 4 ? "queued" : "failed", error: "Email delivery could not be confirmed; retrying uses the same idempotency key.",
          updatedAt: new Date(), nextAttemptAt: new Date(Date.now() + 60000 * job.attempts),
        }).where(eq(emailDeliveriesTable.id, job.id));
      }
    }
    // Only notification metadata is retained here; purge it after 30 days.
    await db.delete(emailDeliveriesTable).where(and(lt(emailDeliveriesTable.createdAt, new Date(Date.now() - 30 * 86400000)), inArray(emailDeliveriesTable.status, ["sent", "failed", "cancelled"])));
  } finally { processing = false; }
}
