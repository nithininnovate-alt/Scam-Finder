import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import { Router } from "express";
import { digest } from "../lib/scamfind-crypto";

export const personalSession = Router();
personalSession.use(cookieParser(process.env.SESSION_SECRET));
personalSession.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Cross-site requests are not allowed." }); return;
    }
    const origin = req.get("origin");
    if (origin) {
      try {
        const allowed = [req.get("host"), req.get("x-forwarded-host")].filter(Boolean);
        if (!allowed.includes(new URL(origin).host)) { res.status(403).json({ error: "Request origin is not allowed." }); return; }
      } catch { res.status(403).json({ error: "Invalid request origin." }); return; }
    }
  }
  let session: unknown = req.signedCookies?.scamfind_session;
  if (typeof session !== "string" || !/^[a-f0-9-]{36}$/.test(session)) {
    session = randomUUID();
    res.cookie("scamfind_session", session, {
      signed: true, httpOnly: true, sameSite: "lax", secure: req.secure || req.get("x-forwarded-proto") === "https",
      maxAge: 365 * 86400000, path: "/api",
    });
  }
  res.locals.browserOwner = digest(session as string);
  res.locals.owner = res.locals.browserOwner;
  next();
});
