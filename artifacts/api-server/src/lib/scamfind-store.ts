import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db, scansTable } from "@workspace/db";
import { decrypt, encrypt } from "./scamfind-crypto";
import type { Scan } from "./scamfind-analysis";

export async function getScans(owner: string) {
  const rows = await db.select().from(scansTable).where(and(eq(scansTable.owner, owner), gt(scansTable.expiresAt, new Date()))).orderBy(desc(scansTable.createdAt));
  return rows.map(row => decrypt(row.encrypted));
}

export async function findScan(owner: string, id: string) {
  const [row] = await db.select().from(scansTable).where(and(eq(scansTable.owner, owner), eq(scansTable.id, id), gt(scansTable.expiresAt, new Date())));
  return row ? decrypt(row.encrypted) : undefined;
}

export async function insertScan(owner: string, scan: Scan) {
  await db.insert(scansTable).values({ id: scan.id, owner, encrypted: encrypt(scan), createdAt: new Date(scan.createdAt), expiresAt: new Date(Date.parse(scan.createdAt) + 90 * 86400000) });
}

export async function saveScan(owner: string, scan: Scan) {
  const expiresAt = new Date(Date.parse(scan.createdAt) + (scan.status === "escalated" ? 730 : 90) * 86400000);
  await db.update(scansTable).set({ encrypted: encrypt(scan), expiresAt }).where(and(eq(scansTable.owner, owner), eq(scansTable.id, scan.id)));
}

export async function removeScan(owner: string, id: string) {
  return db.delete(scansTable).where(and(eq(scansTable.owner, owner), eq(scansTable.id, id))).returning({ id: scansTable.id });
}

export async function purgeExpiredScans() {
  await db.delete(scansTable).where(lt(scansTable.expiresAt, new Date()));
  // Insufficient-data cases close after 72h but remain available until routine expiry.
  const rows = await db.select().from(scansTable).where(and(lt(scansTable.createdAt, new Date(Date.now() - 72 * 3600000)), gt(scansTable.expiresAt, new Date())));
  for (const row of rows) {
    const scan = decrypt(row.encrypted);
    if (scan.verdict === "Insufficient data" && scan.status === "new") {
      scan.status = "closed";
      scan.timeline.push({ at: new Date().toISOString(), description: "Automatically closed after 72 hours without enough evidence." });
      await saveScan(row.owner, scan);
    }
  }
}
