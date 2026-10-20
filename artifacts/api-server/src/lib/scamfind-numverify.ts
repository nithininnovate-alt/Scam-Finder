import { db, integrationUsageTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { digest } from "./scamfind-crypto";
import type { Scan } from "./scamfind-analysis";

type PhoneCheck = NonNullable<Scan["phoneCheck"]>;
type Health = { status: "active" | "configured" | "not_connected" | "error"; message: string };
let health: Health = { status: "configured", message: "API key configured; access has not yet been verified." };
let verifiedUntil = 0;
let probe: Promise<Health> | undefined;
const cache = new Map<string, { until: number; result: PhoneCheck }>();
const pending = new Map<string, Promise<PhoneCheck>>();
const DAILY_LIMIT = 100;

export function numverifyHealth(): Health {
  return process.env.NUMVERIFY_API_KEY ? health : { status: "not_connected", message: "A Numverify API key has not been configured." };
}

export function normalizePhone(raw: string, country?: string): { number: string; country?: string } | undefined {
  if (!raw || raw.length > 40 || !/^[+\d\s().-]+$/.test(raw)) return undefined;
  const number = raw.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (/^\+[1-9]\d{6,14}$/.test(number)) return { number };
  if (/^\d{6,15}$/.test(number) && /^[a-z]{2}$/i.test(country ?? "")) return { number, country: country!.toUpperCase() };
  return undefined;
}

function failureMessage(code: unknown): string {
  if (code === 101 || code === 102) return "Numverify rejected the API key or account access. Update the key or check the account.";
  if (code === 104) return "Numverify's account usage quota has been reached. Check your provider plan.";
  if (code === 105) return "Your Numverify plan does not permit this HTTPS operation. Enable HTTPS access with the provider; no insecure HTTP fallback is used.";
  if (code === 202) return "Numverify did not recognize the country code. Use a two-letter country code or an international number beginning with +.";
  return "Numverify could not complete this lookup. No valid or safe result was assumed.";
}

// Numverify authenticates using a query parameter. Never log the request URL,
// provider response body or fetch error: any of them may contain the credential.
async function request(path: "countries" | "validate", params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const endpoint = new URL(`https://apilayer.net/api/${path}`);
  endpoint.searchParams.set("access_key", process.env.NUMVERIFY_API_KEY!);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000), redirect: "error" });
  const body = await response.json() as Record<string, unknown>;
  const error = body?.error as { code?: number } | undefined;
  if (!response.ok || error || body?.success === false) {
    throw new Error(response.status === 429 ? "Numverify's rate limit was reached. Try again later." : failureMessage(error?.code));
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Numverify returned an unreadable response.");
  return body;
}

export async function probeNumverify(force = false): Promise<Health> {
  if (!process.env.NUMVERIFY_API_KEY) return numverifyHealth();
  if (!force && Date.now() < verifiedUntil) return health;
  if (probe) return probe;
  // This endpoint verifies access without sending a person's phone number.
  probe = (async () => {
    try {
      const countries = await request("countries");
      if (!Object.keys(countries).some(key => /^[A-Z]{2}$/.test(key))) throw new Error("Numverify returned an unreadable country list.");
      health = { status: "active", message: "API access verified over HTTPS. Phone lookups require separate per-scan consent. Number validity does not verify a recruiter's identity." };
      verifiedUntil = Date.now() + 15 * 60000;
    } catch (error) {
      health = { status: "error", message: safeError(error) };
      verifiedUntil = Date.now() + 60000;
    }
    return health;
  })().finally(() => { probe = undefined; });
  return probe;
}

function safeError(error: unknown) {
  // Only expose messages deliberately created here, never native fetch errors.
  const message = error instanceof Error ? error.message : "";
  return /^(Numverify|Your Numverify)/.test(message) ? message : "Numverify timed out or could not be reached. No valid or safe result was assumed.";
}

export async function checkPhoneNumber(raw: string | undefined, country: string | undefined, consent: boolean): Promise<PhoneCheck | undefined> {
  if (!consent) return;
  const checkedAt = new Date().toISOString();
  const input = normalizePhone(raw ?? "", country);
  const result = (status: PhoneCheck["status"], detail: string): PhoneCheck => ({ number: input?.number ?? (raw ?? "").slice(0, 40), status, detail, checkedAt });
  if (!input) return result("skipped", "Enter one complete international phone number beginning with +, or a local number and its two-letter country code. No phone number was sent to Numverify.");
  if (!process.env.NUMVERIFY_API_KEY) return result("unavailable", "Numverify is not configured. No phone number was sent.");
  const key = digest(`${input.country ?? ""}:${input.number}`);
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  if (pending.has(key)) return pending.get(key)!;
  const operation = (async () => {
    try {
      const rows = await db.insert(integrationUsageTable).values({ key: `numverify:${new Date().toISOString().slice(0, 10)}`, used: 1 }).onConflictDoUpdate({
        target: integrationUsageTable.key,
        set: { used: sql`${integrationUsageTable.used} + 1` },
        setWhere: sql`${integrationUsageTable.used} < ${DAILY_LIMIT}`,
      }).returning();
      if (!rows.length) return result("unavailable", "The application's daily safety limit of 100 Numverify lookups has been reached. Try again tomorrow (UTC). Provider quotas may be lower.");
      const body = await request("validate", { number: input.number, ...(input.country ? { country_code: input.country } : {}) });
      if (typeof body.valid !== "boolean") throw new Error("Numverify returned an incomplete validation response.");
      const text = (value: unknown) => typeof value === "string" ? value.slice(0, 160) : "";
      health = { status: "active", message: "Phone lookup access verified over HTTPS. Validity is not proof of recruiter identity, ownership or safety." };
      verifiedUntil = Date.now() + 15 * 60000;
      return {
        ...result(body.valid ? "valid" : "invalid", body.valid
          ? "Numverify recognizes this number in its numbering-plan data. This does not prove it is reachable, owned by the recruiter or safe. This lookup does not change the risk score."
          : "Numverify did not recognize this number as valid. It may be mistyped, incomplete or absent from its data; this alone is not proof of a scam and does not change the risk score."),
        internationalFormat: text(body.international_format), countryName: text(body.country_name),
        countryCode: text(body.country_code), carrier: text(body.carrier), lineType: text(body.line_type),
      };
    } catch (error) {
      health = { status: "error", message: safeError(error) };
      verifiedUntil = Date.now() + 60000;
      return result("unavailable", health.message);
    }
  })().then(value => {
    cache.set(key, { until: Date.now() + (value.status === "unavailable" ? 30000 : 600000), result: value });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}
