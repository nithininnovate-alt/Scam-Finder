---
name: Authentication test readiness
description: Distinguish a valid programmatic session from client-side authentication hydration during browser tests.
---

After programmatic sign-in, wait for the authentication client to report both loaded and signed in before judging a protected page's skeleton as an authentication failure.

**Why:** The test helper established a working backend session while the browser's authentication hooks were still loading. The initial test stopped at the skeleton; one bounded readiness wait allowed the same journey to pass without application or authentication configuration changes.

**How to apply:** Check client readiness and account-request status together. When account requests succeed but a protected page is still loading, inspect client hydration and console/network errors before retrying sign-in or changing authentication code.
