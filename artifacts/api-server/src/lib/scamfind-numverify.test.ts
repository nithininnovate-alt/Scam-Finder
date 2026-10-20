import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { normalizePhone, checkPhoneNumber, probeNumverify } from "./scamfind-numverify";
import { db, pool } from "@workspace/db";
import { numverifyUsage, updateNumverifyLimits, reserveNumverifyLookup } from "./scamfind-numverify-quota";
import { UpdateNumverifyLimitsBody } from "@workspace/api-zod";

// Exercise real PostgreSQL locking with independent pooled connections, without
// modifying the application's settings or counters.
const schema = `numverify_test_${randomUUID().replaceAll("-", "")}`;
const transaction = db.transaction.bind(db);
let transactionMock: ReturnType<typeof mock.method>;
before(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`CREATE TABLE "${schema}".scamfind_integration_settings (LIKE public.scamfind_integration_settings INCLUDING ALL)`);
  await pool.query(`CREATE TABLE "${schema}".scamfind_integration_usage (LIKE public.scamfind_integration_usage INCLUDING ALL)`);
  transactionMock = mock.method(db, "transaction", ((action: Parameters<typeof db.transaction>[0]) =>
    transaction(async tx => {
      await tx.execute(`SET LOCAL search_path TO "${schema}"`);
      return action(tx);
    })) as never);
});
after(async () => {
  transactionMock?.mock.restore();
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
});

test("limits accept only bounded nonnegative integers", () => {
  for (const dailyLimit of [-1, 1.5, "10", null, 2147483648]) {
    assert.equal(UpdateNumverifyLimitsBody.safeParse({ dailyLimit, monthlyLimit: 100 }).success, false);
  }
  assert.equal(UpdateNumverifyLimitsBody.safeParse({ dailyLimit: 10 }).success, false);
  assert.equal(UpdateNumverifyLimitsBody.safeParse({ dailyLimit: 0, monthlyLimit: 2147483647 }).success, true);
});

test("database reservations enforce both shared limits, survive edits, and include legacy daily counters", async () => {
  const defaults = await numverifyUsage();
  assert.equal(defaults.dailyLimit, 100);
  assert.equal(defaults.monthlyLimit, 3100);
  await updateNumverifyLimits({ dailyLimit: 7, monthlyLimit: 5 });
  const reservations = await Promise.all(Array.from({ length: 20 }, () => reserveNumverifyLookup()));
  assert.equal(reservations.filter(Boolean).length, 5, "monthly limit holds under concurrent connections");
  let usage = await numverifyUsage();
  assert.equal(usage.dailyUsed, 5);
  assert.equal(usage.monthlyUsed, 5);
  assert.equal(usage.dailyRemaining, 2);
  assert.equal(usage.monthlyRemaining, 0);
  await updateNumverifyLimits({ dailyLimit: 3, monthlyLimit: 50 });
  assert.equal(await reserveNumverifyLookup(), false, "lowering the daily limit does not erase usage");
  usage = await numverifyUsage();
  assert.equal(usage.dailyUsed, 5);
  assert.equal(usage.dailyRemaining, 0);
  await updateNumverifyLimits({ dailyLimit: 0, monthlyLimit: 50 });
  assert.equal(await reserveNumverifyLookup(), false, "zero pauses lookups");
  await updateNumverifyLimits({ dailyLimit: 8, monthlyLimit: 50 });
  const more = await Promise.all(Array.from({ length: 10 }, () => reserveNumverifyLookup()));
  assert.equal(more.filter(Boolean).length, 3, "daily limit holds under concurrent connections");
  // Simulate a legacy lookup in another day of the current month. Only its
  // aggregate key is stored; no phone number or credential is persisted.
  const now = new Date();
  const otherDay = now.getUTCDate() === 1 ? "02" : "01";
  const month = now.toISOString().slice(0, 7);
  await pool.query(`INSERT INTO "${schema}".scamfind_integration_usage (key, used) VALUES ($1, 4), ($2, 99)`,
    [`numverify:${month}-${otherDay}`, "numverify:2000-01-01"]);
  usage = await numverifyUsage();
  assert.equal(usage.dailyUsed, 8);
  assert.equal(usage.monthlyUsed, 12, "current-month legacy counters count, past months do not");
  assert.match(usage.dailyResetsAt.toISOString(), /T00:00:00\.000Z$/);
  assert.match(usage.monthlyResetsAt.toISOString(), /-01T00:00:00\.000Z$/);
  assert.deepEqual(Object.keys(usage).sort(), [
    "dailyLimit", "dailyRemaining", "dailyResetsAt", "dailyUsed",
    "monthlyLimit", "monthlyRemaining", "monthlyResetsAt", "monthlyUsed",
  ].sort());
  await updateNumverifyLimits({ dailyLimit: 100, monthlyLimit: 3100 });
});

test("phone normalization requires an explicit international prefix or country", () => {
  assert.deepEqual(normalizePhone("+1 (202) 555-0123", "GB"), { number: "+12025550123" });
  assert.deepEqual(normalizePhone("0044 7700 900123"), { number: "+447700900123" });
  assert.deepEqual(normalizePhone("07700 900123", "gb"), { number: "07700900123", country: "GB" });
  for (const number of ["", "123", "2025550123", "+0000000000", "https://example.com", "+12025550123 ext 5", "+1234567890123456"]) {
    assert.equal(normalizePhone(number), undefined);
  }
});

test("consent, HTTPS, response parsing and failure handling", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  let response: Record<string, unknown> = { US: { country_name: "United States", dialling_code: "1" } };
  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    calls++;
    const endpoint = new URL(String(input));
    assert.equal(endpoint.protocol, "https:");
    assert.equal(endpoint.hostname, "apilayer.net");
    assert.equal(endpoint.searchParams.has("access_key"), true);
    assert.equal(endpoint.searchParams.has("text"), false);
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  try {
    const baseline = await numverifyUsage();
    assert.equal(await checkPhoneNumber("+12025550123", undefined, false), undefined);
    assert.equal((await checkPhoneNumber("2025550123", undefined, true))?.status, "skipped");
    assert.equal((await checkPhoneNumber("", "US", true))?.status, "skipped");
    assert.equal(calls, 0);
    assert.equal((await probeNumverify(true)).status, "active");
    assert.equal(calls, 1);
    response = { valid: true, international_format: "+12025550123", country_code: "US", country_name: "United States", carrier: "Fixture carrier", line_type: "landline" };
    const valid = await checkPhoneNumber("+12025550123", undefined, true);
    assert.equal(valid?.status, "valid");
    assert.equal(valid?.carrier, "Fixture carrier");
    assert.match(valid!.detail, /does not prove/);
    await checkPhoneNumber("+12025550123", undefined, true);
    assert.equal(calls, 2, "repeat lookup uses bounded cache");
    response = { valid: false };
    assert.equal((await checkPhoneNumber("+12025550124", undefined, true))?.status, "invalid");
    response = { error: { code: 105, info: "Untrusted provider message must never be exposed" }, success: false };
    const blocked = await checkPhoneNumber("+12025550125", undefined, true);
    assert.equal(blocked?.status, "unavailable");
    assert.match(blocked!.detail, /HTTPS/);
    assert.doesNotMatch(blocked!.detail, /Untrusted/);
    response = { unexpected: true };
    assert.equal((await checkPhoneNumber("+12025550126", undefined, true))?.status, "unavailable");
    response = { valid: true };
    const beforeConcurrent = calls;
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => checkPhoneNumber("+12025550129", undefined, true)));
    assert.equal(concurrent.every(value => value?.status === "valid"), true);
    assert.equal(calls - beforeConcurrent, 1, "identical pending lookups share one reservation and provider request");
    const counted = await numverifyUsage();
    assert.equal(counted.dailyUsed - baseline.dailyUsed, 5, "only uncached consented lookups reserve, including failures");
    await updateNumverifyLimits({ dailyLimit: 0, monthlyLimit: 0 });
    assert.equal((await checkPhoneNumber("+12025550123", undefined, true))?.status, "valid", "cached lookup works while paused");
    const callsBeforePause = calls;
    assert.equal((await checkPhoneNumber("+12025550127", undefined, true))?.status, "unavailable");
    assert.equal(calls, callsBeforePause, "exhausted quotas never call the provider");
    const unavailable = mock.method(db, "transaction", (async () => { throw new Error("private database error"); }) as never);
    try {
      const failure = await checkPhoneNumber("+12025550128", undefined, true);
      assert.equal(failure?.status, "unavailable");
      assert.doesNotMatch(failure!.detail, /private/);
      assert.equal(calls, callsBeforePause, "database errors fail closed without a provider call");
    } finally { unavailable.mock.restore(); }
  } finally {
    fetchMock.mock.restore();
    assert.equal(globalThis.fetch, originalFetch);
  }
});
