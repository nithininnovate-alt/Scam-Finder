---
name: Phone quota policy
description: Rationale for default Numverify application limits and provider-plan boundaries.
---

The default monthly phone allowance preserves the previous daily safety cap's maximum possible calendar-month usage; it is not an estimate of the owner's Numverify plan.

**Why:** The provider plan and billing cycle have not been established. Guessing a smaller plan allowance would unexpectedly block existing use, while guessing provider entitlements could encourage paid usage.

**How to apply:** Keep the daily default at its existing safety level and let administrators explicitly choose plan-appropriate limits. Do not silently synchronize, upgrade, or infer the provider subscription from application counters. Explain that UTC calendar counters exclude usage from other applications sharing the provider account.
