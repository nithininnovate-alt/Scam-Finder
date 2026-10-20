import { Webhook } from "svix";

export const EMAIL_RETENTION_MS = 30 * 86400000;
export const EVENT_STATES = {
  "email.sent": "accepted",
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;
export type DeliveryState = typeof EVENT_STATES[keyof typeof EVENT_STATES];
export type DeliveryEvent = { id: string; providerId: string; type: string; occurredAt: Date };
// Arrival order is not provider event order. Once observed, terminal adverse
// outcomes must not be hidden by a late "sent", "delayed" or "delivered" callback.
const priority: Record<DeliveryState, number> = {
  accepted: 0, delayed: 1, delivered: 2, failed: 3, suppressed: 4, bounced: 5, complained: 6,
};
export function deliveryOutcome(events: DeliveryEvent[]) {
  let result: { state: DeliveryState; at: Date } | undefined;
  for (const event of events) {
    const state = EVENT_STATES[event.type as keyof typeof EVENT_STATES];
    if (state && (!result || priority[state] > priority[result.state] ||
      priority[state] === priority[result.state] && event.occurredAt > result.at)) {
      result = { state, at: event.occurredAt };
    }
  }
  return result;
}

export function verifyEmailEvent(payload: Buffer, headers: Record<string, string>, secret: string, now = Date.now()): DeliveryEvent | undefined {
  const id = headers["svix-id"];
  if (!id || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid event ID");
  if (!/^\d{1,12}$/.test(headers["svix-timestamp"] ?? "") ||
    Math.abs(now - Number(headers["svix-timestamp"]) * 1000) > 300000 ||
    (headers["svix-signature"]?.length ?? 0) > 2048) throw new Error("Invalid signature timestamp");
  // Svix verifies the exact raw bytes, constant-time signatures, and its own
  // five-minute timestamp tolerance. Never stringify parsed JSON here.
  new Webhook(secret).verify(payload, headers);
  // Svix 2 verifies without parsing or returning the JSON payload.
  const event = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
  if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error("Invalid event");
  if (!Object.hasOwn(EVENT_STATES, event.type)) return;
  const data = event.data as Record<string, unknown> | undefined;
  if (!data || typeof data.email_id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(data.email_id) ||
    typeof event.created_at !== "string" || event.created_at.length > 40) throw new Error("Invalid event metadata");
  const occurredAt = new Date(event.created_at);
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now + 300000) throw new Error("Invalid event date");
  if (occurredAt.getTime() <= now - EMAIL_RETENTION_MS) return;
  return { id, providerId: data.email_id, type: event.type, occurredAt };
}
