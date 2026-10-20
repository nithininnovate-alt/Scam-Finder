import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { db, integrationUsageTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { digest } from "./scamfind-crypto";
import type { Scan } from "./scamfind-analysis";

type Result = NonNullable<Scan["ipCheck"]>;
type Health = { status: "active" | "configured" | "not_connected" | "error"; message: string };
const cache = new Map<string, { until: number; value: Result }>();
const pending = new Map<string, Promise<Result>>();
let health: Health = { status: "configured", message: "API key configured; access not yet verified." };
let probing: Promise<Health> | undefined;
let initialProbeDone = false;
const DISCLAIMER = "Community IP reports do not identify a recruiter or prove job fraud. Shared mail servers, VPNs and reassigned addresses can have unrelated reports. A zero score does not prove safety. This does not change ScamFind's risk score.";

export function normalizePublicIp(raw: string): string | undefined {
  const value = raw.trim();
  if (value.length > 45 || !/^[0-9a-f:.]+$/i.test(value) || !isIP(value)) return undefined;
  try {
    const parsed = ipaddr.parse(value);
    // Excludes private, loopback, link-local, multicast, documentation, reserved,
    // shared-address space, IPv4-mapped IPv6 and other special-use ranges.
    if (parsed.range() !== "unicast") return undefined;
    return parsed.toString();
  } catch { return undefined; }
}

function failure(status: number): string {
  if (status === 401 || status === 403) return "AbuseIPDB rejected API access. Check the key and provider account.";
  if (status === 429) return "AbuseIPDB's quota or rate limit has been reached. Try later or check the provider plan.";
  return "AbuseIPDB could not complete this lookup. No clean or safe result was assumed.";
}

async function lookup(ip: string): Promise<Record<string, unknown>> {
  const url = new URL("https://api.abuseipdb.com/api/v2/check");
  url.searchParams.set("ipAddress", ip);
  url.searchParams.set("maxAgeInDays", "90");
  // Lookup only. No report endpoint, verbose report comments or arbitrary hosts.
  try {
    const response = await fetch(url, { headers: { Key: process.env.ABUSEIPDB_API_KEY!, Accept: "application/json" },
      signal: AbortSignal.timeout(7000), redirect: "error" });
    if (!response.ok) throw new Error(failure(response.status));
    const body = await response.json() as { data?: Record<string, unknown>; errors?: unknown };
    const data = body?.data;
    if (body?.errors || !data || typeof data !== "object" || Array.isArray(data)
      || data.isPublic !== true || typeof data.ipAddress !== "string" || normalizePublicIp(data.ipAddress) !== ip
      || !Number.isInteger(data.abuseConfidenceScore) || (data.abuseConfidenceScore as number) < 0 || (data.abuseConfidenceScore as number) > 100
      || !Number.isInteger(data.totalReports) || (data.totalReports as number) < 0) throw new Error(failure(502));
    return data;
  } catch (error) {
    // Do not expose/log raw errors, headers or provider responses.
    if (error instanceof Error && error.message.startsWith("AbuseIPDB")) throw error;
    throw new Error(failure(502));
  }
}

export async function checkIpReputation(raw: string | undefined, consent: boolean, refresh = false): Promise<Result | undefined> {
  if (!consent) return undefined;
  const ip = normalizePublicIp(raw ?? "");
  const result = (status: Result["status"], detail: string): Result =>
    ({ ip: ip ?? "", status, detail, checkedAt: new Date().toISOString(), lookbackDays: 90 });
  if (!ip) return result("skipped", "No IP from this scan was shared. Enter one public IPv4 or IPv6 address, not a hostname, URL, private or reserved address.");
  if (!process.env.ABUSEIPDB_API_KEY) return result("unavailable", "AbuseIPDB is not configured. No IP was shared.");
  const key = digest(`abuseipdb:${ip}`);
  const prior = cache.get(key);
  if (!refresh && prior && prior.until > Date.now()) return prior.value;
  if (pending.has(key)) return pending.get(key)!;
  const operation = (async (): Promise<Result> => {
    try {
      const rows = await db.insert(integrationUsageTable).values({ key: `abuseipdb:${new Date().toISOString().slice(0, 10)}`, used: 1 })
        .onConflictDoUpdate({ target: integrationUsageTable.key, set: { used: sql`${integrationUsageTable.used} + 1` },
          setWhere: sql`${integrationUsageTable.used} < 100` }).returning();
      if (!rows.length) return result("unavailable", "The application's 100-lookup daily UTC safety limit has been reached. No IP was shared.");
      const data = await lookup(ip);
      health = { status: "active", message: "HTTPS lookup access verified. IP checks require separate consent and do not establish recruiter identity." };
      const bounded = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : undefined;
      return { ...result("checked", DISCLAIMER), abuseConfidenceScore: data.abuseConfidenceScore as number,
        totalReports: data.totalReports as number, countryCode: typeof data.countryCode === "string" && /^[A-Z]{2}$/.test(data.countryCode) ? data.countryCode : undefined,
        isp: bounded(data.isp), usageType: bounded(data.usageType),
        lastReportedAt: typeof data.lastReportedAt === "string" && Number.isFinite(Date.parse(data.lastReportedAt)) ? new Date(data.lastReportedAt).toISOString() : undefined };
    } catch (error) {
      health = { status: "error", message: error instanceof Error && error.message.startsWith("AbuseIPDB") ? error.message : failure(502) };
      return result("unavailable", health.message);
    }
  })().then(value => {
    cache.set(key, { until: Date.now() + (value.status === "unavailable" ? 30000 : 600000), value });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

export async function probeAbuseIp(force = false): Promise<Health> {
  if (!process.env.ABUSEIPDB_API_KEY) return { status: "not_connected", message: "An AbuseIPDB key has not been configured." };
  if (probing) return probing;
  if (!force && initialProbeDone) return health;
  initialProbeDone = true;
  probing = (async () => {
    // One initial connection probe per process, not a lookup on every page view.
    // Uses a fixed public resolver IP, never a visitor's IP or offer contents.
    const value = await checkIpReputation("1.1.1.1", true, force);
    if (value?.status !== "checked") health = { status: "error", message: value?.detail ?? failure(502) };
    return health;
  })().finally(() => { probing = undefined; });
  return probing;
}
