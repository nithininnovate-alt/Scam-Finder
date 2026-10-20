import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, checkPhoneNumber, probeNumverify } from "./scamfind-numverify";
import { db } from "@workspace/db";

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
  const reserveMock = mock.method(db, "insert", (() => ({
    values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ used: 1 }] }) }),
  })) as never);
  try {
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
  } finally {
    reserveMock.mock.restore();
    fetchMock.mock.restore();
    assert.equal(globalThis.fetch, originalFetch);
  }
});
