import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { clerkClient } from "@clerk/express";
import { db, pool } from "@workspace/db";
import integrationsRouter from "./scamfind-integrations";
import { ensureNumverifyQuotaSchema } from "../lib/scamfind-numverify-quota";
import { GetIntegrationSettingsResponse, UpdateNumverifyLimitsResponse, GetNotificationPreferencesResponse } from "@workspace/api-zod";

const schema = `integration_routes_${randomUUID().replaceAll("-", "")}`;
const restorers: (() => void)[] = [];
let release = () => {};
let base = "";
const app = express();
app.use(express.json());
// Test authentication boundary. The real requireAdmin still runs in the router.
app.use((_req, res, next) => {
  res.locals.account = { id: "fixture", role: _req.headers["x-fixture-role"] ?? "admin" };
  next();
});
app.use("/api", integrationsRouter);
let server: ReturnType<typeof app.listen>;

before(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of ["scamfind_integration_settings", "scamfind_integration_usage", "scamfind_accounts", "scamfind_email_deliveries", "scamfind_email_events"]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  const client = await pool.connect();
  release = () => client.release();
  await client.query(`SET search_path TO "${schema}"`);
  const fixture = drizzle(client);
  const mocks = [
    mock.method(db, "execute", fixture.execute.bind(fixture) as never),
    mock.method(db, "select", fixture.select.bind(fixture) as never),
    mock.method(db, "insert", fixture.insert.bind(fixture) as never),
    mock.method(db, "update", fixture.update.bind(fixture) as never),
    mock.method(db, "transaction", fixture.transaction.bind(fixture) as never),
    mock.method(clerkClient.users, "getUser", (async () => ({
      primaryEmailAddressId: "primary",
      emailAddresses: [{ id: "primary", emailAddress: "fixture@example.invalid", verification: { status: "verified" } }],
    })) as never),
  ];
  restorers.push(...mocks.map(fn => () => fn.mock.restore()));
  // Start from an existing installation without the new columns.
  await client.query("ALTER TABLE scamfind_integration_settings DROP COLUMN numverify_daily_limit, DROP COLUMN numverify_monthly_limit");
  await client.query("INSERT INTO scamfind_integration_settings (id) VALUES ('main')");
  await ensureNumverifyQuotaSchema();
  await client.query("INSERT INTO scamfind_accounts (id, email, name, role) VALUES ('fixture', 'fixture@example.invalid', 'Fixture', 'user')");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  for (const restore of restorers.reverse()) restore();
  release();
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
});

function patch(path: string, body: unknown, role = "admin") {
  return fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-fixture-role": role },
    body: JSON.stringify(body),
  });
}

test("three PATCH contracts stay separate; quota saves preserve email settings and usage", async () => {
  const initial = GetIntegrationSettingsResponse.parse(await (await fetch(`${base}/admin/integrations`)).json());
  assert.equal(initial.numverifyUsage.dailyLimit, 100);
  assert.equal(initial.numverifyUsage.monthlyLimit, 3100);
  const saved = await patch("/admin/integrations/numverify-limits", { dailyLimit: 12, monthlyLimit: 120 });
  assert.equal(saved.status, 200);
  const usage = UpdateNumverifyLimitsResponse.parse(await saved.json());
  assert.equal(usage.dailyLimit, 12);
  assert.equal(usage.monthlyRemaining, 120);
  assert.equal(usage.dailyUsed, 0);
  assert.deepEqual(Object.keys(usage).sort(), [
    "dailyLimit", "dailyRemaining", "dailyResetsAt", "dailyUsed",
    "monthlyLimit", "monthlyRemaining", "monthlyResetsAt", "monthlyUsed",
  ].sort());
  const email = await patch("/admin/integrations", { senderEmail: "alerts@example.invalid", senderName: "Fixture desk", emailEnabled: true });
  assert.equal(email.status, 200);
  const settings = GetIntegrationSettingsResponse.parse(await email.json());
  assert.equal(settings.senderEmail, "alerts@example.invalid");
  assert.equal(settings.senderName, "Fixture desk");
  assert.equal(settings.emailEnabled, true);
  assert.equal(settings.numverifyUsage.dailyLimit, 12);
  for (const enabled of [true, false]) {
    const preference = await patch("/account/notifications", { enabled }, "user");
    assert.equal(preference.status, 200);
    assert.equal(GetNotificationPreferencesResponse.parse(await preference.json()).enabled, enabled);
  }
  const disabled = await patch("/admin/integrations", { senderEmail: "alerts@example.invalid", senderName: "Fixture desk", emailEnabled: false });
  assert.equal(disabled.status, 200);
  assert.equal((await patch("/account/notifications", { enabled: true }, "user")).status, 409);
  await ensureNumverifyQuotaSchema();
  const persisted = GetIntegrationSettingsResponse.parse(await (await fetch(`${base}/admin/integrations`)).json());
  assert.equal(persisted.numverifyUsage.dailyLimit, 12, "startup migration is idempotent and never resets limits");
  assert.equal(persisted.numverifyUsage.monthlyLimit, 120);
});

test("bad payloads and non-admin requests cannot change limits or sender settings", async () => {
  for (const body of [{ enabled: true }, { senderEmail: "" }, { dailyLimit: -1, monthlyLimit: 100 }, { dailyLimit: 1.2, monthlyLimit: 100 }]) {
    assert.equal((await patch("/admin/integrations/numverify-limits", body)).status, 400);
  }
  assert.equal((await patch("/admin/integrations", { dailyLimit: 1, monthlyLimit: 1 })).status, 400);
  assert.equal((await patch("/account/notifications", { dailyLimit: 1, monthlyLimit: 1 }, "user")).status, 400);
  assert.equal((await fetch(`${base}/admin/integrations`, { headers: { "x-fixture-role": "user" } })).status, 403);
  assert.equal((await patch("/admin/integrations/numverify-limits", { dailyLimit: 0, monthlyLimit: 0 }, "user")).status, 403);
  assert.equal((await patch("/admin/integrations", { senderEmail: "", senderName: "Fixture", emailEnabled: false }, "user")).status, 403);
});
