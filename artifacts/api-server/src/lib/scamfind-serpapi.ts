import { db, integrationUsageTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { digest } from "./scamfind-crypto";
import { normalizedPublicUrl } from "./scamfind-webrisk";
import type { Scan } from "./scamfind-analysis";

type Result = NonNullable<Scan["textSearch"]>;
type Health = { status: "active" | "configured" | "not_connected" | "error"; message: string };
const cache = new Map<string, { until: number; value: Result }>();
const pending = new Map<string, Promise<Result>>();
let health: Health = { status: "configured", message: "API key configured; account access not yet verified." };
let probeUntil = 0;
let probing: Promise<Health> | undefined;
const DISCLAIMER = "Search results suggest possible text reuse, not fraud. Search snippets may be incomplete or inexact. No matches do not establish safety. This check does not change the risk score.";

export function normalizeSearchPhrase(raw: string): string | undefined {
  const phrase = raw.trim().replace(/\s+/g, " ").replace(/["“”]/g, "");
  const words = phrase.split(" ");
  if (phrase.length < 15 || phrase.length > 180 || words.length < 3 || words.length > 24) return undefined;
  // Refuse rather than silently redact: users must review the actual phrase shared.
  if (/[\p{N}@/\\<>]|https?:|www\.|[\p{L}-]+\.[\p{L}]{2,}/iu.test(phrase)) return undefined;
  if (!/^[\p{L}\p{M}\s,.'’!?;:()—–-]+$/u.test(phrase)) return undefined;
  return phrase;
}

function failure(status: number): string {
  if (status === 401 || status === 403) return "SerpAPI rejected account access. Check the API key and provider account.";
  if (status === 429) return "SerpAPI's account quota or rate limit has been reached. Try later or check the provider plan.";
  return "SerpAPI could not complete this request. No search result or safety conclusion was assumed.";
}

async function request(path: "account.json" | "search.json", params: Record<string, string> = {}) {
  const url = new URL(`https://serpapi.com/${path}`);
  url.searchParams.set("api_key", process.env.SERPAPI_API_KEY!);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  // Never log URLs, raw responses, or fetch errors: the query contains the key.
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw new Error(failure(response.status));
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(failure(502));
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SerpAPI")) throw error;
    throw new Error(failure(502));
  }
}

export async function probeSerpApi(force = false): Promise<Health> {
  if (!process.env.SERPAPI_API_KEY) return { status: "not_connected", message: "A SerpAPI key has not been configured." };
  if (!force && probeUntil > Date.now()) return health;
  if (probing) return probing;
  probing = (async () => {
    try {
      // Account API is free and does not transmit a search phrase or offer.
      const body = await request("account.json");
      if (body.error || body.account_status !== "Active") throw new Error("SerpAPI account access is not active. Check the provider account.");
      if (typeof body.total_searches_left === "number" && body.total_searches_left <= 0) throw new Error(failure(429));
      health = { status: "active", message: "Account access verified over HTTPS. Searches require a separately reviewed phrase and explicit consent." };
    } catch (error) {
      health = { status: "error", message: error instanceof Error && error.message.startsWith("SerpAPI") ? error.message : failure(502) };
    }
    probeUntil = Date.now() + (health.status === "active" ? 900000 : 60000);
    return health;
  })().finally(() => { probing = undefined; });
  return probing;
}

export async function checkTextReuse(raw: string | undefined, consent: boolean, offer: string): Promise<Result | undefined> {
  if (!consent) return undefined;
  const phrase = normalizeSearchPhrase(raw ?? "");
  const result = (status: Result["status"], detail: string, results: Result["results"] = []): Result =>
    ({ phrase: phrase ?? "", status, detail, results, checkedAt: new Date().toISOString() });
  if (!phrase) return result("skipped", "No phrase sent. Choose 3–24 words, 15–180 characters, with no numbers, email addresses, web addresses or personal details.");
  if (phrase.toLowerCase() === normalizeSearchPhrase(offer)?.toLowerCase()) return result("skipped", "No phrase sent. Select a short excerpt rather than the entire offer.");
  if (!process.env.SERPAPI_API_KEY) return result("unavailable", "SerpAPI is not configured. No phrase was shared.");
  const key = digest(`serpapi:${phrase.toLowerCase()}`);
  const prior = cache.get(key);
  if (prior && prior.until > Date.now()) return prior.value;
  if (pending.has(key)) return pending.get(key)!;
  const operation = (async (): Promise<Result> => {
    try {
      const rows = await db.insert(integrationUsageTable).values({ key: `serpapi:${new Date().toISOString().slice(0, 10)}`, used: 1 })
        .onConflictDoUpdate({ target: integrationUsageTable.key, set: { used: sql`${integrationUsageTable.used} + 1` },
          setWhere: sql`${integrationUsageTable.used} < 25` }).returning();
      if (!rows.length) return result("unavailable", "The application's 25-search daily UTC safety limit has been reached. No phrase was shared.");
      const body = await request("search.json", { engine: "google", q: `"${phrase}"`, num: "5", safe: "active" });
      const meta = body.search_metadata as { status?: unknown } | undefined;
      const empty = body.error === "Google hasn't returned any results for this query.";
      if (body.error && !empty || meta?.status !== "Success") throw new Error(failure(502));
      if (!empty && body.organic_results !== undefined && !Array.isArray(body.organic_results)) throw new Error(failure(502));
      const rawResults = (Array.isArray(body.organic_results) ? body.organic_results : []) as Record<string, unknown>[];
      const results = rawResults.slice(0, 10).flatMap(hit => {
        if (!hit || typeof hit !== "object" || typeof hit.link !== "string" || typeof hit.title !== "string") return [];
        const url = normalizedPublicUrl(hit.link);
        if (!url) return [];
        return [{ url, title: hit.title.slice(0, 200), snippet: typeof hit.snippet === "string" ? hit.snippet.slice(0, 500) : "" }];
      }).slice(0, 5);
      // Do not turn malformed, filtered, or non-organic results into a clean search.
      if (rawResults.length && !results.length) throw new Error(failure(502));
      return result(results.length ? "matches_found" : "no_matches",
        `${results.length ? "Google returned potentially related pages for the quoted phrase." : "Google returned no organic results for this phrase."} ${DISCLAIMER}`, results);
    } catch (error) {
      health = { status: "error", message: error instanceof Error && error.message.startsWith("SerpAPI") ? error.message : failure(502) };
      probeUntil = Date.now() + 60000;
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
