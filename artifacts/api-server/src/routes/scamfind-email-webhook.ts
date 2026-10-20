import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { db, emailEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyEmailEvent, type DeliveryEvent } from "../lib/scamfind-email-events";

export async function recordEmailEvent(event: DeliveryEvent) {
  const inserted = await db.insert(emailEventsTable).values(event).onConflictDoNothing().returning({ id: emailEventsTable.id });
  if (inserted.length) return;
  const [existing] = await db.select().from(emailEventsTable).where(eq(emailEventsTable.id, event.id));
  if (!existing || existing.providerId !== event.providerId || existing.type !== event.type ||
    existing.occurredAt.getTime() !== event.occurredAt.getTime()) throw new Error("Conflicting event ID");
}

// Injectable dependencies allow signed HTTP fixtures without credentials or mail.
export function emailWebhookRouter(
  store = recordEmailEvent,
  secret = () => process.env.RESEND_WEBHOOK_SECRET,
) {
  const router = Router();
  router.post("/api/webhooks/resend",
    rateLimit({ windowMs: 60000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }),
    express.raw({ type: "application/json", limit: "32kb", inflate: false }),
    async (req, res): Promise<void> => {
      const key = secret();
      if (!key) { res.status(503).json({ error: "Delivery verification is not configured." }); return; }
      if (!Buffer.isBuffer(req.body)) { res.status(415).json({ error: "Expected application/json." }); return; }
      let event: DeliveryEvent | undefined;
      try {
        event = verifyEmailEvent(req.body, {
          "svix-id": req.get("svix-id") ?? "",
          "svix-timestamp": req.get("svix-timestamp") ?? "",
          "svix-signature": req.get("svix-signature") ?? "",
        }, key);
      } catch {
        res.status(400).json({ error: "Invalid webhook." }); return;
      }
      if (event) await store(event); // Failure returns 5xx so Resend can retry.
      res.status(200).json({ received: true });
    });
  return router;
}
