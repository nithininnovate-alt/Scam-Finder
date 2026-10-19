import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, scansTable, accountsTable } from "@workspace/db";
import { decrypt } from "./scamfind-crypto";
import type { Scan } from "./scamfind-analysis";
import type { UpdateScanBody } from "@workspace/api-zod";

export async function adminCases(id?: string) {
  const conditions = [gt(scansTable.expiresAt, new Date())];
  if (id) conditions.push(eq(scansTable.id, id));
  const rows = await db.select({ owner: accountsTable, encrypted: scansTable.encrypted })
    .from(scansTable)
    .innerJoin(accountsTable, eq(scansTable.owner, sql`'account:' || ${accountsTable.id}`))
    .where(and(...conditions))
    .orderBy(desc(scansTable.createdAt));
  return rows.map(row => ({
    ownerId: row.owner.id, ownerName: row.owner.name, ownerEmail: row.owner.email, scan: decrypt(row.encrypted),
  }));
}

export function recordCaseUpdate(scan: Scan, data: ReturnType<typeof UpdateScanBody.parse>, actor: string) {
  const at = new Date().toISOString();
  if (data.status && data.status !== scan.status) scan.timeline.push({ at, description: `${actor}: status changed from ${scan.status} to ${data.status}.` });
  if (data.notes !== undefined && data.notes !== scan.notes) scan.timeline.push({ at, description: `${actor}: case notes updated.` });
  if (data.feedback && data.feedback !== scan.feedback) scan.timeline.push({ at, description: `${actor}: verdict feedback recorded as ${data.feedback}. Feedback does not automatically retrain a model.` });
  Object.assign(scan, data);
}
