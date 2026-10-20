import { or, lt } from "drizzle-orm";
import { db, emailDeliveriesTable, emailEventsTable } from "@workspace/db";
import { EMAIL_RETENTION_MS } from "./scamfind-email-events";

export async function purgeExpiredEmailMetadata() {
  const cutoff = new Date(Date.now() - EMAIL_RETENTION_MS);
  // Includes abandoned queued/sending jobs: expired alerts must never be sent.
  await db.delete(emailDeliveriesTable).where(lt(emailDeliveriesTable.createdAt, cutoff));
  await db.delete(emailEventsTable).where(or(
    lt(emailEventsTable.occurredAt, cutoff), lt(emailEventsTable.receivedAt, cutoff),
  ));
}
