# Verified email delivery tracking

## Enable only with the owner's approval

1. After the application changes are available at your intended HTTPS address,
   open **Webhooks** in the Resend dashboard. Use that address plus
   `/api/webhooks/resend` as the callback URL.
2. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`,
   `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`.
   Open/click tracking is not used.
3. Copy the endpoint's signing secret into the application's secure configuration
   as `RESEND_WEBHOOK_SECRET`. Never put it in chat, source control, browser
   configuration, screenshots, or logs. Restart the API after configuring it.
4. Check the provider's webhook delivery log. The admin panel reports whether a
   signing secret exists, **not** whether the provider's webhook is enabled or
   correctly configured. An absent delivery event remains unconfirmed.

The existing provider connection is sending-only. Do not broaden its permissions
to list domains or create webhooks. Manage webhooks in the provider dashboard.
Live tracking remains disabled unless the owner configures the signing secret.
No production change or
real test message is needed to run the fixture tests.

## Meaning of states

- **Accepted by provider:** the send API accepted the message, or a verified
  `email.sent` event arrived. It is not proof of delivery.
- **Delivered to mail server:** Resend reports that the recipient's mail server
  accepted the email. This does not establish inbox placement or reading.
- **Delivery delayed:** a temporary delivery problem was reported.
- **Bounced:** permanent rejection.
- **Spam complaint reported:** the provider reported a spam complaint.
- **Provider reported failure / suppressed:** an asynchronous provider failure
  or suppression, distinct from a local API-attempt failure.

Events can arrive before the send response or in a different order. The summary
uses conservative precedence: complaint, bounce, suppression, failure, delivery,
delay, acceptance. Lower-priority later callbacks cannot hide adverse evidence;
within a state, the latest provider timestamp is shown. This is a summary of
verified evidence, not a last-callback-wins log.

## Security and retention

- The raw JSON body is verified using Svix before JSON parsing, account middleware,
  or application routing. Svix 2 verifies signatures without returning parsed JSON.
- Timestamp tolerance is five minutes, including future timestamps. Events older
  than the retention window are acknowledged but ignored.
- Bodies are limited to 32 KiB. Compression is rejected, and callbacks are
  rate-limited. Invalid inputs never invoke event storage.
- A durable unique event ID makes concurrent retries idempotent. Reuse of an ID
  for conflicting metadata fails rather than silently replacing evidence.
- Only event ID, provider email ID, type, provider timestamp and receipt timestamp
  are stored. No payloads, addresses, subjects, bodies, provider bounce text,
  attachments, or signature headers are stored in the event table.
- Outbox/event metadata expires after 30 days. Reads hide expired rows; the queue
  worker purges them every 20 seconds while running, before sending any jobs.
  Expired queued/sending jobs are removed too. If the service is stopped, deletion
  resumes when it starts.
- Callbacks only insert email-event metadata. They never change ownership, case
  status, notification preferences, or queue new alerts.
- Recent delivery metadata and configuration remain administrator-only.

## Local checks — no real email

```sh
pnpm --filter @workspace/db run push
pnpm run typecheck
pnpm --filter @workspace/api-server run test:email-events
```

The test suite signs local fixtures with an ephemeral key. It checks raw-body
integrity, forged/missing/stale/future signatures, malformed JSON, unsupported
events, payload limits, disabled configuration, durable concurrent duplicates,
out-of-order outcomes, early callbacks, retention and admin authorization. It
creates and removes synthetic database fixtures, without sending mail or calling
the provider API. The development database is required.

Provider references:
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/event-types
- https://resend.com/docs/webhooks/introduction
