---
name: Local OCR privacy decision
description: Why document OCR stays local rather than using a third-party service.
---

Keep document OCR local unless the user explicitly changes that choice.

**Why:** The user chose “Local OCR without an external provider” after the integration search found no matching OCR connector.

**How to apply:** Do not silently substitute a hosted OCR or vision API when local extraction fails. Any future external document processing requires provider disclosure and explicit consent for each document, separate from link-check consent.
