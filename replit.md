# ScamFind

A job-offer screening web application with explainable risk indicators, evidence reports, verification guidance and personal case tracking.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- Frontend managed workflow: `artifacts/scamfind: web`; API managed workflow: `artifacts/api-server: API Server`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, managed authentication keys; never log secrets. Changing `SESSION_SECRET` requires a data-key migration for existing encrypted cases.
- `SCAMFIND_ADMIN_EMAIL` is the owner-configured initial-admin email. Only its verified primary identity can consume the one-time admin grant. Development and production grant independently on verified sign-in; never copy identity IDs between environments.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/scamfind/`: browser app, routes and presentation.
- `artifacts/api-server/src/lib/scamfind-*`: parsing, rules, domain checks, encryption, reports and persistence.
- `artifacts/api-server/src/routes/scamfind.ts`: browser-scoped API.
- `lib/db/src/schema/scans.ts`: encrypted case storage.
- `lib/db/src/schema/accounts.ts`: local account roles and one-time administrator bootstrap marker.
- `lib/api-spec/openapi.yaml`: authoritative API contract; regenerate clients after changes.

## Architecture decisions

- This is an initial phased release of the attached PRD, not its production go-live checklist. Never claim measured accuracy, legal certainty or verified company identity without supporting benchmark or provider results.
- Public MX/DNS and RDAP are available. Google Web Risk URL lookups are opt-in and require an enabled API/billing project. Other reputation/identity sources and ML remain unconnected. Missing or failed checks must not be presented as passed.
- Managed sign-in identifies users; application database roles enforce admin/user permissions on the server. Never assign administrator access to the first registrant or accept a client-supplied role.
- Account histories use a separate ownership namespace from legacy anonymous browser scans. Move legacy scans only after explicit opt-in from a signed-in user holding the original signed browser cookie. Legacy anonymous material is excluded from administrator review until imported.
- The PRD has conflicting retention statements: favor its privacy-first 90-day routine retention; explicitly escalated cases receive up to 24 months. A scheduled purge runs hourly.
- Uploads are parsed transiently; original PDF/email attachment bytes are never executed or retained. Report hashes cover submitted UTF-8 source text (extracted text for PDFs). PDF provenance separately records an original-byte hash in the timeline; exports are not certified forensic custody.

## Product

- Paste or upload `.txt`, `.html`, `.eml`, or text-based `.pdf`; optional sender; 42 weighted text/sender rules across nine categories plus any actual opt-in URL-list findings.
- PDF uploads are limited to 5 MB and 20 pages, parsed sequentially in isolated, memory/time-bounded workers. Optional per-document local English OCR uses Tesseract and Poppler with bounded native processes (512 MB, 20 CPU seconds per process, 15-second stage timeouts, 120-second document OCR budget, one OCR job at a time). The original PDF stays in memory; temporary rendered page images are deleted in finally blocks. No document bytes go to an external OCR provider. Missing tools or partial processing are explicitly reported, never treated as successful coverage. Password-protected and unreadable documents fail before OCR. No visual authenticity or attachment malware claims.
- Google Web Risk checks up to five normalized public HTTP(S) URLs per consenting scan, strips query strings/fragments and skips credentials/private hosts. A database-backed daily cap bounds usage across instances. No-match does not establish safety.
- The Integrations page exposes opt-in user case-update emails and role-protected sender/test/connection controls. Resend requires a sender address on a verified domain; its send-only connection cannot list or verify domains.
- Reviewer status/notes edits and opted-in email events are saved atomically. A durable outbox rechecks consent and verified primary recipient at dispatch, retries transient failures with an idempotency key and expires delivery metadata after 30 days. Test emails require an explicit administrator action and go only to that administrator's verified address. Offer text and notes are excluded.
- Delivery callbacks require a separately approved `RESEND_WEBHOOK_SECRET`; without it `/api/webhooks/resend` fails closed and administrators see tracking as disabled. Provider acceptance is not mail-server delivery or proof of reading. Setup and fixture-test instructions: `docs/email-delivery-tracking.md`.
- Explainable verdict, snippets, domain age/mail records, coverage limitations and verification checklist.
- Account-scoped saved scans across devices, case status/notes, feedback, timeline, PDF export and batch CSV screening.
- Public landing page and branded sign-in/sign-up; separate personal dashboard and admin overview with account/case review.
- Administrators can review account-owned scans and update status/notes with actor-attributed audit entries; ordinary users cannot access other users' reports.
- Reporting guidance for official India, US and phishing-reporting destinations; never claim automatic complaint submission.
- Deferred: `.msg`, image authenticity, multilingual OCR, analyst assignment/severity workflows, inbound forwarding, browser extension/share sheet, remaining commercial providers, trained classifier and validated accuracy/compliance. Payments are not connected; no charges or paid scan allowance are represented as active.

## User preferences

- Product name: ScamFind.

## Gotchas

- Do not fetch offer URLs or render uploaded HTML. External calls use fixed DNS/RDAP, Google Web Risk, identity-provider and email-service endpoints; never target arbitrary URLs supplied in offers.
- Do not seed realistic-looking public cases or fabricate usage, provider findings or accuracy metrics.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
