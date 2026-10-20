import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { db } from "@workspace/db";
import { checkIpReputation, normalizePublicIp, probeAbuseIp } from "./scamfind-abuseipdb";

test("only strict public IPv4 and IPv6 addresses are accepted", () => {
  assert.equal(normalizePublicIp(" 1.1.1.1 "), "1.1.1.1");
  assert.equal(normalizePublicIp("2001:4860:4860:0000:0000:0000:0000:8888"), "2001:4860:4860::8888");
  for (const ip of ["", "example.com", "https://1.1.1.1", "1.1.1.1:80", "127.1", "0177.0.0.1",
    "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "100.64.0.1",
    "0.0.0.0", "192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fe80::1", "fe80::1%eth0", "ff02::1", "2001:db8::1", "::ffff:8.8.8.8", "::ffff:127.0.0.1"]) {
    assert.equal(normalizePublicIp(ip), undefined, `must reject ${ip}`);
  }
});

test("lookup-only consent, results, caching, quota and unavailable states", async () => {
  process.env.ABUSEIPDB_API_KEY = "synthetic-mocked-key";
  let calls = 0;
  let quota = true;
  let status = 200;
  let malformed = false;
  const transport = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.abuseipdb.com");
    assert.equal(url.pathname, "/api/v2/check");
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(new Headers(init?.headers).has("key"), true);
    assert.equal(url.searchParams.has("key"), false);
    assert.equal(url.searchParams.has("verbose"), false);
    assert.equal(url.searchParams.get("maxAgeInDays"), "90");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["ipAddress", "maxAgeInDays"]);
    return new Response(JSON.stringify(status !== 200 ? { errors: [{ detail: "sensitive fixture detail" }] } : {
      data: { ipAddress: url.searchParams.get("ipAddress"), isPublic: true, abuseConfidenceScore: malformed ? "0" : 37,
        totalReports: 12, countryCode: "US", isp: "Fixture ISP", lastReportedAt: null },
    }), { status, headers: { "content-type": "application/json" } });
  });
  const reserve = mock.method(db, "insert", (() => ({ values: () => ({
    onConflictDoUpdate: () => ({ returning: async () => quota ? [{ used: 1 }] : [] }),
  }) })) as never);
  try {
    assert.equal(await checkIpReputation("8.8.8.8", false), undefined);
    assert.equal((await checkIpReputation("192.168.1.1", true))?.status, "skipped");
    assert.equal((await checkIpReputation(undefined, true))?.status, "skipped");
    assert.equal(calls, 0);
    const [first, simultaneous] = await Promise.all([checkIpReputation("8.8.8.8", true), checkIpReputation("8.8.8.8", true)]);
    assert.deepEqual(first, simultaneous);
    assert.equal(first?.status, "checked");
    assert.equal(first?.abuseConfidenceScore, 37);
    assert.equal(first?.totalReports, 12);
    assert.equal(first?.lastReportedAt, undefined);
    assert.match(first!.detail, /zero score does not prove safety/);
    await checkIpReputation("8.8.8.8", true);
    assert.equal(calls, 1);
    assert.equal((await checkIpReputation("2001:4860:4860::8888", true))?.status, "checked");
    assert.equal((await probeAbuseIp()).status, "active");
    assert.equal(calls, 3);
    await probeAbuseIp();
    assert.equal(calls, 3, "page views must not consume additional connection probes");
    status = 429;
    const limited = await checkIpReputation("9.9.9.9", true);
    assert.equal(limited?.status, "unavailable");
    assert.match(limited!.detail, /quota/);
    assert.equal(limited!.detail.includes("sensitive fixture"), false);
    assert.equal((await probeAbuseIp(true)).status, "error", "explicit recheck bypasses cached success");
    status = 200;
    malformed = true;
    assert.equal((await checkIpReputation("8.8.4.4", true))?.status, "unavailable");
    quota = false;
    const before = calls;
    assert.match((await checkIpReputation("208.67.222.222", true))!.detail, /daily UTC/);
    assert.equal(calls, before);
  } finally {
    transport.mock.restore();
    reserve.mock.restore();
  }
});
