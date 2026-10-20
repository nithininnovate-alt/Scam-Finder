import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { db } from "@workspace/db";
import { checkTextReuse, normalizeSearchPhrase, probeSerpApi } from "./scamfind-serpapi";

test("reviewed phrases reject common sensitive identifiers and web addresses", () => {
  assert.equal(normalizeSearchPhrase("refundable training and equipment deposit"), "refundable training and equipment deposit");
  for (const value of ["", "two words", "contact person@example.com for this role", "call our phone number +12025550123", "visit https://example.com for details", "see recruiter.example for details", "hello ".repeat(30)]) {
    assert.equal(normalizeSearchPhrase(value), undefined);
  }
});

test("consent boundaries, quotas, result normalization, caching and explicit failures", async () => {
  // Synthetic credential only, in this isolated mocked test process.
  process.env.SERPAPI_API_KEY = "synthetic-test-key";
  let calls = 0;
  let quotaAvailable = true;
  let status = 200;
  let body: Record<string, unknown> = { account_status: "Active", total_searches_left: 250 };
  const transport = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "serpapi.com");
    assert.equal(url.searchParams.has("text"), false);
    if (url.pathname === "/search.json") {
      assert.equal(url.searchParams.get("engine"), "google");
      assert.match(url.searchParams.get("q")!, /^"[^"]+"$/);
      assert.equal(url.searchParams.has("offer"), false);
    }
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  const reserve = mock.method(db, "insert", (() => ({ values: () => ({
    onConflictDoUpdate: () => ({ returning: async () => quotaAvailable ? [{ used: 1 }] : [] }),
  }) })) as never);
  const offer = "Synthetic private fixture not to be shared with search engines.";
  const phrase = "refundable training and equipment deposit";
  try {
    assert.equal(await checkTextReuse(phrase, false, offer), undefined);
    assert.equal((await checkTextReuse("contact person@example.com for details", true, offer))?.status, "skipped");
    assert.equal((await checkTextReuse(phrase, true, phrase))?.status, "skipped");
    assert.equal(calls, 0);
    assert.equal((await probeSerpApi(true)).status, "active");
    body = { search_metadata: { status: "Success" }, organic_results: [{ title: "<script>not executed</script>", link: "https://example.com/source?tracking=removed#fragment", snippet: "Fixture snippet" }] };
    const [first, duplicate] = await Promise.all([checkTextReuse(phrase, true, offer), checkTextReuse(phrase, true, offer)]);
    assert.equal(first?.status, "matches_found");
    assert.deepEqual(first, duplicate);
    assert.equal(first?.results[0]?.url, "https://example.com/source");
    assert.match(first!.detail, /not fraud/);
    assert.equal(calls, 2);
    await checkTextReuse(phrase, true, offer);
    assert.equal(calls, 2);
    body = { search_metadata: { status: "Success" }, organic_results: [] };
    assert.equal((await checkTextReuse("a different generic phrase with no results", true, offer))?.status, "no_matches");
    body = { search_metadata: { status: "Success" }, organic_results: [{ title: "Private", link: "http://127.0.0.1/private" }] };
    assert.equal((await checkTextReuse("another generic phrase for filtered results", true, offer))?.status, "unavailable");
    status = 429;
    body = { error: "fixture sensitive provider message" };
    const limited = await checkTextReuse("generic phrase about quota limits", true, offer);
    assert.equal(limited?.status, "unavailable");
    assert.match(limited!.detail, /quota/);
    assert.equal(limited!.detail.includes("fixture sensitive"), false);
    quotaAvailable = false;
    const before = calls;
    assert.match((await checkTextReuse("generic phrase for daily safety cap", true, offer))!.detail, /daily UTC/);
    assert.equal(calls, before);
  } finally {
    transport.mock.restore();
    reserve.mock.restore();
  }
});
