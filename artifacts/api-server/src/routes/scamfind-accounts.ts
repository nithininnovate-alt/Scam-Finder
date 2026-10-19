import { Router } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, scansTable } from "@workspace/db";
import { GetAccountResponse, GetBrowserScanCountResponse, ImportBrowserScansResponse } from "@workspace/api-zod";
import { decrypt, encrypt } from "../lib/scamfind-crypto";

const router = Router();

router.get("/account", (_req, res) => {
  const account = res.locals.account;
  res.json(GetAccountResponse.parse({ ...account, createdAt: account.createdAt.toISOString() }));
});

router.get("/account/browser-scans", async (_req, res): Promise<void> => {
  const rows = await db.select({ id: scansTable.id }).from(scansTable).where(and(
    eq(scansTable.owner, res.locals.browserOwner), gt(scansTable.expiresAt, new Date()),
  ));
  res.json(GetBrowserScanCountResponse.parse({ count: rows.length }));
});

router.post("/account/import-browser-scans", async (_req, res): Promise<void> => {
  const count = await db.transaction(async tx => {
    // Lock only legacy rows identified by the signed browser cookie. No owner
    // identifier or list of case IDs is accepted from the caller.
    const rows = await tx.select().from(scansTable).where(and(
      eq(scansTable.owner, res.locals.browserOwner), gt(scansTable.expiresAt, new Date()),
    )).for("update");
    for (const row of rows) {
      const scan = decrypt(row.encrypted);
      scan.timeline.push({ at: new Date().toISOString(), description: `Browser history explicitly imported by account ${res.locals.account.id}. Authorized administrators can now review this case.` });
      await tx.update(scansTable).set({ owner: res.locals.owner, encrypted: encrypt(scan) }).where(and(eq(scansTable.id, row.id), eq(scansTable.owner, res.locals.browserOwner)));
    }
    return rows.length;
  });
  res.json(ImportBrowserScansResponse.parse({ count }));
});

export default router;
