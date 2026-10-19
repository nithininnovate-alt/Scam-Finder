import { isIP } from "node:net";
import { parse as parseDomain } from "tldts";
import { db, integrationUsageTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { digest } from "./scamfind-crypto";
import type { Scan } from "./scamfind-analysis";

type UrlCheck = NonNullable<Scan["urlChecks"]>[number];
type Health = { status: "active" | "configured" | "not_connected" | "error"; message: string };
let health: Health = { status: "configured", message: "Configured. Use the connection check to verify access; URL lookups require per-scan consent." };
let healthUntil = 0;
let probePromise: Promise<Health> | undefined;
const cache = new Map<string, { until: number; result: UrlCheck }>();
const pending = new Map<string, Promise<UrlCheck>>();
const DAILY_LIMIT = 1000;

export function webRiskHealth(): Health {
  return process.env.GOOGLE_WEB_RISK_API_KEY ? health : { status: "not_connected", message: "A Web Risk API key has not been configured." };
}

export function normalizedPublicUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw.replace(/[.,;!?]+$/, ""));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) return;
    // Do not disclose intranet/private-address links to an external service.
    const domain = parseDomain(url.hostname, { allowPrivateDomains: false });
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) || !domain.domain || !domain.isIcann) return;
    url.hash = "";
    url.search = "";
    if (url.toString().length > 2048) return;
    return url.toString();
  } catch { return; }
}

async function reserveLookup() {
  const key = `webrisk:${new Date().toISOString().slice(0, 10)}`;
  const rows = await db.insert(integrationUsageTable).values({ key, used: 1 }).onConflictDoUpdate({
    target: integrationUsageTable.key,
    set: { used: sql`${integrationUsageTable.used} + 1` },
    setWhere: sql`${integrationUsageTable.used} < ${DAILY_LIMIT}`,
  }).returning();
  return rows.length > 0;
}

async function lookup(url: string): Promise<UrlCheck> {
  const checkedAt = new Date().toISOString();
  const unavailable = (detail: string): UrlCheck => ({ url, status: "unavailable", threatTypes: [], detail, checkedAt });
  if (!process.env.GOOGLE_WEB_RISK_API_KEY) return unavailable("Web Risk is not configured. No lookup was performed.");
  if (!await reserveLookup()) return unavailable("The application has reached its daily Web Risk safety limit of 1,000 lookups. Try again tomorrow.");
  try {
    const endpoint = new URL("https://webrisk.googleapis.com/v1/uris:search");
    ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"].forEach(t => endpoint.searchParams.append("threatTypes", t));
    endpoint.searchParams.set("uri", url);
    // Keep credentials out of URLs, logs, report content and browser responses.
    const response = await fetch(endpoint, {
      headers: { "X-Goog-Api-Key": process.env.GOOGLE_WEB_RISK_API_KEY },
      signal: AbortSignal.timeout(6000), redirect: "error",
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: { details?: { reason?: string }[] } } | null;
      const reasons = failure?.error?.details?.map(detail => detail.reason) ?? [];
      const message = reasons.includes("BILLING_DISABLED")
        ? "Google Cloud billing is disabled for this Web Risk project. Enable billing in Google Cloud to run link checks; usage charges may apply."
        : reasons.includes("SERVICE_DISABLED") ? "Enable the Web Risk API in the Google Cloud project associated with your API key."
        : reasons.includes("API_KEY_INVALID") ? "Google rejected the API key. Update the Web Risk secret with a valid key."
        : response.status === 401 || response.status === 403
        ? "Web Risk access was denied. Check API activation, key restrictions and the Google Cloud billing configuration."
        : response.status === 429 ? "Web Risk rate or usage limit reached. Try again later." : "Web Risk is temporarily unavailable.";
      health = { status: "error", message }; healthUntil = Date.now() + 60000;
      return unavailable(message);
    }
    const body = await response.json() as { threat?: { threatTypes?: unknown; expireTime?: string } };
    if (!body || typeof body !== "object" || Array.isArray(body)) return unavailable("Web Risk returned an unreadable response.");
    const threats = body.threat?.threatTypes;
    if (body.threat && (!Array.isArray(threats) || !threats.every(t => typeof t === "string"))) return unavailable("Web Risk returned an incomplete threat response.");
    const threatTypes = (threats ?? []) as string[];
    health = { status: "active", message: "Connection verified. Opt-in checks query Google Web Risk without visiting the suspicious site." };
    healthUntil = Date.now() + 600000;
    const result: UrlCheck = {
      url, status: threatTypes.length ? "listed" : "not_listed", threatTypes, checkedAt,
      detail: threatTypes.length ? `Google Web Risk lists this normalized URL for ${threatTypes.join(", ")}. Do not open it.`
        : "No match on the requested Google Web Risk lists at this time. This is not proof that the link, recruiter or job is safe.",
    };
    const expiry = Date.parse(body.threat?.expireTime ?? "");
    const ttl = threatTypes.length ? Number.isFinite(expiry) ? Math.min(1800000, Math.max(0, expiry - Date.now())) : 60000 : 600000;
    cache.set(digest(url), { until: Date.now() + ttl, result });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return result;
  } catch {
    health = { status: "error", message: "Web Risk timed out or could not be reached. No clean result was assumed." };
    healthUntil = Date.now() + 60000;
    return unavailable(health.message);
  }
}

async function cachedLookup(url: string) {
  const key = digest(url);
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  if (pending.has(key)) return pending.get(key)!;
  const promise = lookup(url).then(result => {
    if (result.status === "unavailable") cache.set(key, { until: Date.now() + 30000, result });
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export async function checkOfferLinks(links: string[], consent: boolean): Promise<UrlCheck[]> {
  if (!consent) return [];
  const urls = Array.from(new Set(links.map(normalizedPublicUrl).filter((url): url is string => !!url)));
  const results = await Promise.all(urls.slice(0, 5).map(cachedLookup));
  const skipped = links.length - results.length;
  if (skipped > 0) results.push({
    url: "", status: "skipped", threatTypes: [], checkedAt: new Date().toISOString(),
    detail: `${skipped} link(s) were skipped or normalized/deduplicated. At most 5 public HTTP(S) URLs are checked; credentials, private hosts, query strings and fragments are excluded. Coverage is incomplete.`,
  });
  return results;
}

export async function probeWebRisk(force = false): Promise<Health> {
  if (!process.env.GOOGLE_WEB_RISK_API_KEY) return webRiskHealth();
  if (!force && healthUntil > Date.now()) return health;
  if (probePromise) return probePromise;
  probePromise = lookup("https://example.com/").then(() => {
    healthUntil = Date.now() + (health.status === "active" ? 600000 : 60000);
    return health;
  }).finally(() => { probePromise = undefined; });
  return probePromise;
}
