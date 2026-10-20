---
name: Provider privacy boundaries
description: Consent scope when extending URL, document, image or email integrations.
---

Treat consent to link-reputation lookup as narrower than consent to send a whole offer, PDF or image to a third-party service. A connected service is not permission to transmit additional content.

**Why:** Job offers can contain personal details and confidential attachments. Adding document upload alongside external integrations must not silently broaden what leaves the application.

**How to apply:** New OCR, image-authenticity or document-analysis providers need clear disclosure of what is sent and an appropriate explicit opt-in. Keep failure and coverage limitations visible; do not substitute URL reputation for document authenticity.

Keep Resend's sending-only authorization unchanged when adding delivery tracking.
Webhook management and its verification configuration require separate owner
approval; a dismissed configuration request is not approval to widen permissions.

**Why:** The user explicitly required that the sending connection not gain domain
listing or webhook-management permissions merely to support delivery events.

**How to apply:** Use the provider dashboard and secure secret configuration for
approved callback setup. Leave live verification disabled when approval or the
signing secret is missing.
