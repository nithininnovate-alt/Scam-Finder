---
name: Email provider compatibility
description: Documentation and runtime assumptions to check when extending delivery verification.
---

Do not assume the installed webhook verifier returns the parsed event just
because a provider documentation example assigns its return value.

**Why:** Resend's example showed a parsed Svix return, while the installed Svix
major version verified successfully but returned nothing. Casting its return
would hide the mismatch and cause all valid callbacks to fail afterward.

**How to apply:** Check the installed verifier's type contract, verify exact raw
bytes first, and only then parse JSON. Keep a signed success fixture, not just
forgery-rejection tests, when upgrading the dependency.

For Node fixture tests, bundle local workspace TypeScript rather than assuming
Node can follow its extensionless directory imports. Leave worker-based logging
packages external unless using the server's worker-aware build configuration.

**Why:** Native Node resolution rejected the database schema directory import;
bundling the logger without its worker assets then caused a post-test crash
despite passing assertions.

**How to apply:** Treat a clean test-process exit as part of success, and preserve
workspace and worker resolution when changing test packaging.
