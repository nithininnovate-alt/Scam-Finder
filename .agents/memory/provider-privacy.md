---
name: Provider privacy boundaries
description: Consent boundaries for document, link, phone, search, IP and email providers.
---

Treat consent to link-reputation lookup as narrower than consent to send a whole offer, PDF or image to a third-party service. A connected service is not permission to transmit additional content.

**Why:** Job offers can contain personal details and confidential attachments. Adding document upload alongside external integrations must not silently broaden what leaves the application.

**How to apply:** New OCR, image-authenticity or document-analysis providers need clear disclosure of what is sent and an appropriate explicit opt-in. Keep failure and coverage limitations visible; do not substitute URL reputation for document authenticity.

Phone-number validation needs a separate opt-in and an explicitly selected number, not automatic submission of digit sequences extracted from offers.

**Why:** Offers can contain identity, bank and reference numbers that look like telephone numbers. Number validity and carrier metadata do not establish recruiter identity or fraud.

**How to apply:** Share only the selected phone number and its country context. Keep this consent independent from link lookup and OCR, and do not turn a valid number into a safety claim.

Search-engine text reuse needs separate opt-in and a user-reviewed short phrase; never automatically send extracted offer text as a search query.

**Why:** A connected search API can disclose confidential offer contents to both the API provider and a search engine. Search matches alone do not establish fraud.

**How to apply:** Share only the explicitly selected phrase. Block common numeric identifiers, email and web addresses; warn users to remove names and confidential details. Keep search results separate from the risk score and disclose search-coverage limitations.

IP reputation is lookup-only and needs separate consent for one selected public IP. Do not automatically use a visitor's address, resolve offer links, send full email headers or submit abuse reports.

**Why:** Users approved lookup-only access. Mail-routing IPs may belong to shared infrastructure, so community reports do not establish recruiter identity or job fraud.

**How to apply:** Reject private and special-use IPs. Keep provider abuse-confidence separate from ScamFind's risk score. Any connection probe must use a fixed public infrastructure IP, not a user's IP.

Keep Resend's sending-only authorization unchanged when adding delivery tracking.
Webhook management and its verification configuration require separate owner
approval; a dismissed configuration request is not approval to widen permissions.

**Why:** The user explicitly required that the sending connection not gain domain
listing or webhook-management permissions merely to support delivery events.

**How to apply:** Use the provider dashboard and secure secret configuration for
approved callback setup. Leave live verification disabled when approval or the
signing secret is missing.
