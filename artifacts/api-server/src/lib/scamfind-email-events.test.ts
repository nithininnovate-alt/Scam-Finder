import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { Webhook } from "svix";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, accountsTable, emailDeliveriesTable, emailEventsTable } from "@workspace/db";
import { deliveryOutcome, EMAIL_RETENTION_MS, verifyEmailEvent, type DeliveryEvent } from "./scamfind-email-events";
import { emailWebhookRouter, recordEmailEvent } from "../routes/scamfind-email-webhook";
import { recentDeliveries } from "./scamfind-email";
import integrationsRouter from "../routes/scamfind-integrations";
import { GetIntegrationSettingsResponse } from "@workspace/api-zod";
import { purgeExpiredEmailMetadata } from "./scamfind-email-retention";

// Ephemeral local-only signing key, never a configured credential.
const secret = `whsec_${randomBytes(32).toString("base64")}`;
const signer = new Webhook(secret);
const providerId = randomUUID();
function payload(type = "email.delivered", date = new Date()) {
  return JSON.stringify({
    type, created_at: date.toISOString(),
    data: { email_id: providerId, to: ["ignored@example.invalid"], subject: "NOT STORED",
      html: "NOT STORED", caseStatus: "escalated", owner: "attacker" },
  });
}
function signed(body: string, date = new Date(), id = `msg_${randomUUID()}`) {
  return {
    "content-type": "application/json", "svix-id": id,
    "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
    "svix-signature": signer.sign(id, date, body),
  };
}

test("raw-body verification accepts a signed fixture and minimizes stored metadata", () => {
  const body = payload();
  const headers = signed(body);
  const event = verifyEmailEvent(Buffer.from(body), headers, secret)!;
  assert.deepEqual(Object.keys(event).sort(), ["id", "occurredAt", "providerId", "type"]);
  assert.equal(event.providerId, providerId);
  assert.equal(event.type, "email.delivered");
  assert.throws(() => verifyEmailEvent(Buffer.from(`${body} `), headers, secret));
  assert.throws(() => verifyEmailEvent(Buffer.from(body), { ...headers, "svix-id": "forged" }, secret));
  assert.throws(() => verifyEmailEvent(Buffer.from(body), signed(body, new Date(Date.now() - 301000)), secret));
  assert.throws(() => verifyEmailEvent(Buffer.from(body), signed(body, new Date(Date.now() + 301000)), secret));
});

test("malformed, forged, expired, future, missing and unsupported event fixtures", () => {
  for (const body of ["{", "null", "[]", JSON.stringify({ type: "email.delivered" }), payload("email.delivered", new Date(Date.now() + 600000))]) {
    assert.throws(() => verifyEmailEvent(Buffer.from(body), signed(body), secret));
  }
  const body = payload();
  assert.throws(() => verifyEmailEvent(Buffer.from(body), {}, secret));
  assert.throws(() => verifyEmailEvent(Buffer.from(body), signed(body), `whsec_${randomBytes(32).toString("base64")}`));
  const opened = payload("email.opened");
  assert.equal(verifyEmailEvent(Buffer.from(opened), signed(opened), secret), undefined);
  const old = payload("email.delivered", new Date(Date.now() - EMAIL_RETENTION_MS - 1000));
  assert.equal(verifyEmailEvent(Buffer.from(old), signed(old), secret), undefined);
});

test("duplicate and out-of-order outcomes never regress terminal delivery evidence", () => {
  const make = (type: string, time: number): DeliveryEvent => ({ id: randomUUID(), providerId, type, occurredAt: new Date(time) });
  const events = [make("email.sent", 500), make("email.delivered", 400), make("email.bounced", 300), make("email.complained", 200)];
  assert.equal(deliveryOutcome(events)?.state, "complained");
  assert.deepEqual(deliveryOutcome(events), deliveryOutcome([...events].reverse()));
  assert.deepEqual(deliveryOutcome(events), deliveryOutcome([...events, ...events]));
  assert.equal(deliveryOutcome(events.slice(0, 3))?.state, "bounced");
  assert.equal(deliveryOutcome([make("email.delivery_delayed", 500), make("email.delivered", 400)])?.state, "delivered");
  assert.equal(deliveryOutcome([make("email.failed", 200), make("email.sent", 500)])?.state, "failed");
  assert.equal(deliveryOutcome([make("email.suppressed", 200)])?.state, "suppressed");
  assert.equal(deliveryOutcome([]), undefined);
});

test("HTTP callback rejects unsafe inputs, fails closed without configuration, and never invokes storage on invalid requests", async () => {
  const saved: DeliveryEvent[] = [];
  const app = express();
  app.use(emailWebhookRouter(async event => { saved.push(event); }, () => secret));
  app.use(express.json());
  // Isolated callback does not proceed to application routes.
  app.use((_req, res) => { res.status(418).end(); });
  app.use(((err, _req, res, _next) => { res.status(err.status ?? 500).json({ error: "Request rejected" }); }) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/api/webhooks/resend`;
  try {
    const body = payload();
    assert.equal((await fetch(url, { method: "POST", headers: signed(body), body })).status, 200);
    assert.equal(saved.length, 1);
    assert.equal((await fetch(url, { method: "POST", headers: signed(body), body: `${body} ` })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "text/plain" }, body })).status, 415);
    const huge = JSON.stringify({ data: "x".repeat(33000) });
    assert.equal((await fetch(url, { method: "POST", headers: signed(huge), body: huge })).status, 413);
    assert.equal((await fetch(url, { method: "POST", headers: { ...signed(body), "content-encoding": "gzip" }, body })).status, 415);
    assert.equal(saved.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  const disabled = express();
  disabled.use(emailWebhookRouter(async () => assert.fail("Must not store"), () => undefined));
  const disabledServer = disabled.listen(0, "127.0.0.1");
  await once(disabledServer, "listening");
  try {
    const address = disabledServer.address() as { port: number };
    const body = payload();
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/webhooks/resend`, { method: "POST", headers: signed(body), body })).status, 503);
  } finally { await new Promise<void>(resolve => disabledServer.close(() => resolve())); }
});

test("durable deduplication, early callbacks, retention filtering, and administrator-only visibility", async () => {
  const accountId = `fixture_${randomUUID()}`;
  const jobId = randomUUID();
  const expiredJobId = randomUUID();
  const eventIds: string[] = [];
  const event = (type: string, date = new Date()): DeliveryEvent => {
    const id = `msg_${randomUUID()}`; eventIds.push(id);
    return { id, type, providerId, occurredAt: date };
  };
  try {
    const delivered = event("email.delivered");
    await Promise.all([recordEmailEvent(delivered), recordEmailEvent(delivered), recordEmailEvent(delivered)]);
    assert.equal((await db.select().from(emailEventsTable).where(eq(emailEventsTable.id, delivered.id))).length, 1);
    await assert.rejects(recordEmailEvent({ ...delivered, type: "email.bounced" }));
    await db.insert(accountsTable).values({ id: accountId, email: "fixture@example.invalid", name: "Fixture", role: "user" });
    await db.insert(emailDeliveriesTable).values([
      { id: jobId, accountId, type: "test", status: "sent", providerId },
      { id: expiredJobId, accountId, type: "test", status: "sent", providerId, createdAt: new Date(Date.now() - EMAIL_RETENTION_MS - 1000) },
    ]);
    assert.equal((await recentDeliveries()).find(row => row.id === jobId)?.deliveryState, "delivered");
    assert.equal((await recentDeliveries()).some(row => row.id === expiredJobId), false);
    const expired = event("email.complained", new Date(Date.now() - EMAIL_RETENTION_MS - 1000));
    await db.insert(emailEventsTable).values(expired);
    assert.equal((await recentDeliveries()).find(row => row.id === jobId)?.deliveryState, "delivered");
    await purgeExpiredEmailMetadata(); // Purging is independent of sending.
    assert.equal((await db.select().from(emailDeliveriesTable).where(eq(emailDeliveriesTable.id, expiredJobId))).length, 0);
    assert.equal((await db.select().from(emailEventsTable).where(eq(emailEventsTable.id, expired.id))).length, 0);
    await recordEmailEvent(event("email.bounced"));
    await recordEmailEvent(event("email.sent"));
    assert.equal((await recentDeliveries()).find(row => row.id === jobId)?.deliveryState, "bounced");
    await recordEmailEvent(event("email.complained"));
    assert.equal((await recentDeliveries()).find(row => row.id === jobId)?.deliveryState, "complained");
    const [job] = await db.select().from(emailDeliveriesTable).where(eq(emailDeliveriesTable.id, jobId));
    assert.equal(job.accountId, accountId);
    assert.equal(job.status, "sent"); // No new send, no queue transition.
    assert.equal(job.attempts, 0);

    const app = express();
    app.use((req, res, next) => {
      // Test harness only; production role comes from requireAccount.
      if (req.headers["x-fixture-role"]) res.locals.account = { role: req.headers["x-fixture-role"] };
      next();
    });
    app.use(integrationsRouter);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/admin/integrations`;
    try {
      for (const method of ["GET", "PATCH", "POST"]) {
        for (const headers of [{}, { "x-fixture-role": "user" }]) {
          const path = method === "POST" ? `${url}/test-email` : url;
          assert.equal((await fetch(path, { method, headers })).status, 403);
        }
      }
      const response = await fetch(url, { headers: { "x-fixture-role": "admin" } });
      assert.equal(response.status, 200);
      const result = GetIntegrationSettingsResponse.parse(await response.json());
      assert.equal(result.deliveries.find((row: { id: string }) => row.id === jobId)?.deliveryState, "complained");
      assert.equal(typeof result.deliveryTrackingConfigured, "boolean");
      assert.equal(JSON.stringify(result).includes(providerId), false);
      assert.equal(JSON.stringify(result).includes("NOT STORED"), false);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  } finally {
    await db.delete(emailEventsTable).where(and(eq(emailEventsTable.providerId, providerId), inArray(emailEventsTable.id, eventIds)));
    await db.delete(accountsTable).where(eq(accountsTable.id, accountId)); // Cascades fixture jobs only.
  }
});

test.after(async () => { await pool.end(); });
