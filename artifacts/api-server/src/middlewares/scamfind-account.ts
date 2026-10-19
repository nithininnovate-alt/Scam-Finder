import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { db, accountsTable, adminBootstrapTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const requireAccount: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  const userId = (typeof auth.sessionClaims?.userId === "string" ? auth.sessionClaims.userId : auth.userId);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access your account." }); return;
  }
  let [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, userId));
  const configuredEmail = process.env.SCAMFIND_ADMIN_EMAIL?.trim().toLowerCase();
  // Provision local accounts from the trusted identity provider, never request body.
  // Checking the configured bootstrap account is intentionally live until the
  // one-time grant exists, so a later verified sign-in works without a reset.
  const [bootstrap] = configuredEmail ? await db.select().from(adminBootstrapTable).where(eq(adminBootstrapTable.key, "initial-admin")) : [];
  if (!account || (!bootstrap && configuredEmail && account.email === configuredEmail)) {
    const identity = await clerkClient.users.getUser(userId);
    const emailAddress = identity.emailAddresses.find(email => email.id === identity.primaryEmailAddressId);
    const email = emailAddress?.emailAddress.trim().toLowerCase() ?? "";
    const name = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || identity.username || email.split("@")[0] || "ScamFind user";
    if (!account) {
      await db.insert(accountsTable).values({ id: userId, email, name, role: "user" }).onConflictDoNothing();
    }
    if (!bootstrap && configuredEmail && email === configuredEmail && emailAddress?.verification?.status === "verified") {
      await db.transaction(async tx => {
        const inserted = await tx.insert(adminBootstrapTable).values({ key: "initial-admin", userId }).onConflictDoNothing().returning();
        if (inserted.length) await tx.update(accountsTable).set({ role: "admin" }).where(eq(accountsTable.id, userId));
      });
    }
    [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, userId));
  }
  if (!account) { res.status(503).json({ error: "Account setup is temporarily unavailable." }); return; }
  res.locals.account = account;
  // Legacy anonymous hashes cannot collide with the explicit account namespace.
  res.locals.owner = `account:${account.id}`;
  next();
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.account?.role !== "admin") {
    res.status(403).json({ error: "Administrator access required." }); return;
  }
  next();
};
