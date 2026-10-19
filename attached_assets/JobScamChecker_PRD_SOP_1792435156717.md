# Job Offer Scam Detection Platform — PRD & SOP

**Document type:** Product Requirements Document (PRD) + Standard Operating Procedure (SOP)
**Version:** 1.0 | **Date:** 20 October 2026 | **Owner:** Product & Trust & Safety

---

# PART 1 — PRODUCT REQUIREMENTS DOCUMENT

## 1. Problem statement

Job and employment scams are among the highest-volume fraud categories reported globally (India's cybercrime portal receives thousands of job-fraud complaints monthly; the US FTC reports hundreds of millions of dollars in annual employment-scam losses). Victims receive fake offer letters via email, WhatsApp, Telegram and job portals, and lose money to "registration fees," fake equipment purchases, or data theft. Existing defences (user vigilance, spam filters) are insufficient because scam templates are highly polished and reused across thousands of campaigns.

## 2. Product vision

A single screening platform where a user pastes, uploads, or forwards a suspicious job offer and receives, within seconds, a calibrated risk verdict backed by live third-party intelligence and a concrete action plan. The premium tier integrates commercial threat-intelligence, email-verification, company-registry and web-reputation APIs to move detection beyond keyword rules into verified ground truth.

## 3. Goals and non-goals

**Goals**
- Detect fraudulent job offers with ≥95% precision and ≥85% recall on the internal benchmark set.
- Provide a verdict + evidence report in <15 seconds for 95% of inputs.
- Integrate at least 8 premium/commercial data sources for enrichment.
- Make the output actionable: exact evidence snippets, verification steps, and one-tap reporting links.

**Non-goals**
- Blocking email at the inbox level (we screen, we don't filter).
- Guaranteeing verdicts on offers from companies with zero digital footprint (the product must say "insufficient data" rather than guess).
- Legal adjudication (the product flags; authorities decide).

## 4. Target users and personas

| Persona | Context | Key need |
|---|---|---|
| Job seeker (consumer) | Received an offer letter | Fast, plain-language verdict |
| Campus placement / HR coordinator | Screens employer outreach for students | Batch upload + bulk report |
| Trust & Safety analyst | Investigates at a job portal or bank | Evidence trail, case notes, escalation workflow |
| Law enforcement / cyber cell | Needs preserved evidence | Exportable forensic report (headers, hashes, timeline) |

## 5. Functional requirements (MoSCoW)

### 5.1 Ingestion
- **FR-1 (Must)** Paste free text; upload `.eml`, `.msg`, `.txt`, `.html`; strip HTML to readable text.
- **FR-2 (Must)** Manual "sender email" field; auto-extract from `.eml` headers (From, Reply-To, Return-Path, Received chain).
- **FR-3 (Should)** Browser extension: "Check this offer" on Gmail/Outlook web + job-portal pages.
- **FR-4 (Should)** Forward-to-check: dedicated inbound email address (e.g. `check@ourdomain`) parsed automatically.
- **FR-5 (Could)** WhatsApp/Telegram share-sheet integration.

### 5.2 Analysis engine
- **FR-6 (Must)** Rule engine: 40+ weighted signals across 9 categories (money requests, data harvesting, urgency, chat-app interviewing, unrealistic pay, template language, sender-domain mismatch, malicious links, attachment risk). Weights tunable via config, versioned.
- **FR-7 (Must)** Live enrichment pipeline (Section 8): domain age, MX/DNS, IP and URL reputation, email validity, company registry match, exact-text reuse search.
- **FR-8 (Must)** Composite scoring: `Risk = w1·RuleScore + w2·EnrichmentScore + w3·MLScore`, normalised 0–100 with hard floors (e.g., any money-request match ⇒ floor 60).
- **FR-9 (Must)** Calibrated verdicts: **Likely genuine / Suspicious / Likely scam / Insufficient data** with per-signal evidence snippets (quoted text, matched pattern, API result).
- **FR-10 (Should)** ML classifier (fine-tuned language model on labelled scam/genuine letters) as a third score component; model versioned, retrained quarterly, drift-monitored.
- **FR-11 (Should)** Sender-domain graph check: is this domain seen across many scam reports in our own case store?
- **FR-12 (Could)** Image analysis: logo/letterhead reverse-image match against the real company's official assets (Bing Visual Search or Google Lens endpoint).

### 5.3 Output & reporting
- **FR-13 (Must)** Verdict card: score ring, verdict, triggered checks, passed checks, evidence chips.
- **FR-14 (Must)** Verification checklist personalised to the case (registry lookup link, official-domain comparison, call-the-company prompt).
- **FR-15 (Must)** One-tap reporting: pre-filled complaints to national cybercrime portal (India: cybercrime.gov.in / 1930; plus CERT-In phishing report), Gmail/Yahoo "report phishing" deep links.
- **FR-16 (Should)** Forensic export: PDF report containing original headers, extracted domains/IPs with reputation at scan time, SHA-256 of the raw artifact, UTC timeline.
- **FR-17 (Should)** Batch mode: spreadsheet upload of many letters, scored results as CSV/XLSX.

### 5.4 Case management & analyst tier
- **FR-18 (Should)** Case store: every scan retained with verdict, evidence, analyst notes, status (new/triaged/escalated/closed).
- **FR-19 (Should)** SLA timers and escalation queues per the SOP (Part 2).
- **FR-20 (Could)** Feedback loop: user "this verdict was wrong" button feeding retraining pipeline.

## 6. Non-functional requirements

| Category | Requirement |
|---|---|
| Latency | p95 < 15s end-to-end (parallelised API calls, 5s per-call timeout) |
| Availability | 99.5% monthly |
| Accuracy | ≥95% precision, ≥85% recall vs. labelled benchmark (refreshed monthly) |
| Privacy | Personal data minimised; letter content encrypted at rest (AES-256); DPDP Act (India) and GDPR compliant; user content auto-purged after 90 days unless escalated to a case |
| Security | No execution of attachments; all links fetched only through reputation APIs, never rendered client-side; API keys in a secrets manager |
| Auditability | Every verdict reproducible: store rule-set version, API versions, model version, raw API responses |
| Cost | Premium tier blended API cost target ≤ $0.04 per scan at production volumes |

## 7. System architecture

```
Ingestion (paste / upload / extension / forward)
        │
        ▼
Parser ──► normalised letter object {text, headers, sender, links[], attachments[]}
        │
        ▼
Parallel enrichment workers ───────────────────────────────┐
  ├─ Domain intel (RDAP/WHOIS, DNS, MX)                    │
  ├─ Reputation (Safe Browsing, VirusTotal, AbuseIPDB)     │
  ├─ Email verify (ZeroBounce/Hunter)                      │
  ├─ Registry (OpenCorporates / MCA / SEC)                 │
  └─ Web intel (SerpAPI exact-phrase reuse, company site)  │
        │                                                   │
        ▼                                                   │
Scoring service: rule engine + enrichment fusion + ML       │
        │                                                   │
        ▼                                                   │
Verdict service → verdict card / forensic PDF / case store ◄┘
```

Key design decisions: (1) enrichment calls run in parallel with a circuit breaker per provider; (2) scoring is deterministic and versioned — same input + same versions ⇒ same score; (3) all third-party responses cached 24h (domains) to control cost.

## 8. Premium API integration matrix

| # | Capability | Primary (premium) | Fallback (free) | Role in scoring |
|---|---|---|---|---|
| 1 | Domain age & WHOIS | WHOISXML API | Verisign RDAP | <6 months old ⇒ +25; masked/young WHOIS ⇒ +10 |
| 2 | URL/link reputation | VirusTotal (premium quota) | Google Safe Browsing API | Any engine flags a link ⇒ +30; clean ⇒ 0 |
| 3 | IP reputation | AbuseIPDB Pro | AbuseIPDB free | Malicious IP in Received chain ⇒ +15 |
| 4 | Email validity & type | ZeroBounce (or NeverBounce) | MX check via DoH | Free mailbox domain for "company" mail ⇒ +12; invalid/disposable ⇒ +20 |
| 5 | Company-domain pattern match | Hunter.io Domain Search | Manual official-site check | Claimed company ≠ sender domain pattern ⇒ +15 |
| 6 | Exact-text reuse search | SerpAPI (Google) | Google Custom Search JSON | Offer sentence found on scam-report sites ⇒ +30 |
| 7 | Company registry verification | OpenCorporates API | MCA India / SEC EDGAR direct | Company in letter doesn't exist in registry ⇒ +25; CIN/registration mismatch ⇒ +15 |
| 8 | Breach corpus check | Have I Been Pwned domain search | — | Sender domain appearing only in breach corpora (weak signal) ⇒ +5 |
| 9 | Phone validation | Twilio Lookup | Numverify | VoIP/disposable number in signature ⇒ +10 |
| 10 | Malware hash check | VirusTotal file hash | — | Attachment hash known-bad ⇒ score forced ≥90 |
| 11 | Visual/logo match | Bing Visual Search API | Google Lens (manual) | Letterhead mimicking real company ⇒ +15 |
| 12 | ML classifier | In-house fine-tuned model (API endpoint) | Rules-only mode | Model confidence contributes up to ±20 |

Integration principles: every provider behind an internal adapter with rate-limiting, retry with backoff, timeout 5s, and graceful degradation — a provider outage must never block a verdict, only reduce enrichment score weight and mark the report "reduced confidence."

## 9. Scoring model (v1)

```
RuleScore      = Σ matched rule weights (max 100)          # 40+ signals, 9 categories
EnrichmentScore= Σ API-derived signals (max 60, scaled)    # Section 8 right-hand column
MLScore        = model probability × 100                   # phishing-classifier ensemble

Raw  = 0.45·RuleScore + 0.35·min(EnrichmentScore,100) + 0.20·MLScore
Risk = clamp(Raw, 0, 100)
Hard floors: money-request matched ⇒ ≥60 | known-bad attachment ⇒ ≥90 | free-domain "company" sender ⇒ ≥40

Verdicts:  0–24 Likely genuine · 25–54 Suspicious · 55–100 Likely scam
           "Insufficient data" overrides when both text <100 chars AND no verifiable sender domain.
```

Calibration: thresholds tuned quarterly on the benchmark set; publish precision/recall per threshold in the admin dashboard.

## 10. User flows (primary)

1. User pastes letter → optional sender email → **Analyse**.
2. System runs rules + 12 enrichment adapters in parallel (<15s).
3. Verdict card renders: score, verdict, triggered checks with quoted evidence, passed checks, personalised verification checklist.
4. If Likely scam: prominent "Do not reply" guidance + one-tap report links (cybercrime.gov.in, CERT-In, mail-provider phishing report).
5. Advanced users: download forensic PDF; analysts: push to case store with SLA.

## 11. Metrics & KPIs

- Detection quality: precision, recall, F1, false-positive rate (weekly dashboard).
- Operational: median scan latency, API cost per scan, provider uptime/failure rate.
- User: verdict helpfulness rating, % of scam verdicts where user clicked a report link, repeat usage.
- Impact (lagging): downstream confirmed-scam confirmations from user feedback and analyst triage.

## 12. Rollout plan

| Phase | Scope | Exit criteria |
|---|---|---|
| P1 (weeks 1–4) | Rules engine + RDAP + Safe Browsing + paste/upload + verdict card | p95 < 8s, benchmark precision ≥90% |
| P2 (weeks 5–8) | ZeroBounce, Hunter, SerpAPI, VirusVT, AbuseIPDB + forensic PDF + report links | Full 12-source enrichment live |
| P3 (weeks 9–12) | OpenCorporates/MCA registry, Twilio, HIBP, ML classifier v1, case store | Recall ≥85%, analyst tier in daily use |
| P4 (weeks 13+) | Extension, forward-to-check, batch mode, visual match | Consumer GA |

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| API cost blowout at scale | Aggressive caching (24h domain cache), batching, per-scan budget circuit breaker |
| Provider outage degrades verdicts | Graceful degradation + "reduced confidence" flag; dual-provider per capability where cheap |
| False accusations of genuine companies | Precision-first thresholds, "Insufficient data" escape hatch, evidence-only language in UI ("this domain was registered 12 days ago", never "this company is fake") |
| Handling personal data (victim CVs, IDs) | Encryption, 90-day purge, DPDP/GDPR review, no attachments executed |
| Scam templates evolve faster than rules | ML component + monthly benchmark refresh + user feedback loop |

---

# PART 2 — STANDARD OPERATING PROCEDURE (SOP)

**SOP owner:** Trust & Safety Lead | **Applies to:** all analysts and operators | **Review cycle:** quarterly

## SOP-1 Purpose

Ensure every suspicious job offer received by the platform is triaged consistently, escalated within defined SLAs, reported to the correct authorities, and preserved as evidence — regardless of which analyst handles it.

## SOP-2 Definitions

- **Case:** one scanned artifact (letter + enrichment result + verdict).
- **Verdicts:** Likely genuine / Suspicious / Likely scam / Insufficient data.
- **Severity:** SEV-1 financial loss or data theft already occurred; SEV-2 active fraud campaign (same sender/domain across ≥3 cases); SEV-3 single suspicious letter; SEV-4 informational/clean.

## SOP-3 Intake

1. Every user scan auto-creates a case record with: raw artifact (SHA-256), parsed text, headers, sender, scan timestamp (UTC), engine versions, full API responses.
2. Cases are routed by verdict: *Suspicious* → manual triage queue; *Likely scam* → triage queue with 4h SLA; *Insufficient data* → user prompted for sender/more text, else auto-close in 72h; *Likely genuine* → auto-close.
3. Batch uploads (campus/partner feeds) create cases in bulk with SEV-3 default.

## SOP-4 Triage workflow (analyst, per case)

1. **Open the verdict card.** Read every triggered check and its quoted evidence. Never change a verdict without noting a reason in the case log.
2. **Confirm sender domain (2 min):** run domain through WHOISXML/RDAP — record registration date, registrar, country. Age < 6 months ⇒ treat as hostile unless strong counter-evidence.
3. **Confirm company (3 min):** search OpenCorporates / MCA (India) / Companies House / SEC EDGAR. If the letter names a real company, open the company's **official** site from the registry record — not from the email — and compare: domain spelling, careers-page listings, HR contact.
4. **Confirm text reuse (2 min):** run one distinctive sentence from the letter as an exact-phrase search (SerpAPI). Hits on scam-reporting or consumer-complaint sites ⇒ attach link to case.
5. **Check links/attachments (2 min):** all URLs via VirusTotal; attachment hashes via VirusTotal. Known-bad ⇒ escalate one SEV level immediately. Never open attachments.
6. **Decide:** confirm, downgrade, or escalate the verdict. Record: decision, evidence links, analyst ID, UTC timestamp.

**Target handling time: ≤15 minutes per case.**

## SOP-5 Escalation matrix

| Condition | Action | SLA |
|---|---|---|
| SEV-1 (victim lost money/data) | Advise immediate report to cybercrime portal / 1930 helpline (India) or local equivalent; preserve all evidence; flag related sender across case store | Same hour |
| SEV-2 (campaign: ≥3 linked cases) | Blocklist sender domain+IP in internal watchlist; open campaign record; notify partner job portals if feed exists | 4 hours |
| SEV-3 (single suspicious) | Complete triage, close with notes | 24 hours |
| Counter-terror/CSAM content inside artifact | Stop processing, preserve, report per legal escalation path | Immediate |
| Verdict disputed by a partner company | Senior analyst review within 1 business day; if wrong, file false-positive report into retraining pipeline | 1 business day |

## SOP-6 Reporting playbook (user-facing guidance embedded in verdict card)

- India: National Cyber Crime Portal (cybercrime.gov.in) or helpline **1930**; phishing emails to **incident@cert-in.org.in**; also report within Gmail/Yahoo/Outlook as phishing.
- US: FTC ReportFraud.ftc.gov; phishing to reportphishing@apwg.org.
- Global: APWG report; Google Safe Browsing report page; Interpol/ local police for losses.
- Always: block sender, do not reply, do not pay any "refundable" fee, and freeze any shared bank data with the bank.

## SOP-7 Evidence preservation

- Raw artifact stored immutably (WORM storage), SHA-256 recorded at intake.
- Full header chain and all enrichment API responses archived with the case.
- Export format for law enforcement: forensic PDF (SOP FR-16) + original `.eml`.
- Retention: active/escalated cases 24 months; routine cases 12 months; then purge per privacy policy.

## SOP-8 Quality & calibration loop

- Weekly: sample 5% of auto-closed *Likely genuine* cases for audit; sample all verdict overrides.
- Monthly: benchmark refresh — run current engine + API versions against the labelled set; recalibrate thresholds; document changes (who/what/when).
- Quarterly: red-team with 50 newly collected scam letters (must catch ≥85%); rule-set and model version bump.
- Every provider failure or anomaly: log in the provider register; if a provider fails >2% of calls over 7 days, switch to fallback provider and open vendor ticket.

## SOP-9 Analyst rules of engagement

- Never contact the scammer directly from platform infrastructure.
- Never open links or attachments outside the reputation-API wrapper.
- Treat all letter content as potentially private (it contains victims' CVs and IDs): no copies to personal devices, no external pastes into unsecured tools.
- Communicate findings in evidence-based language only ("domain registered 14 days before the letter date"), never absolute accusations.

---

## Appendix A — Pre-launch checklist (go/no-go)

- [ ] 12 enrichment adapters live with fallbacks tested (simulate provider outage)
- [ ] Benchmark suite: precision ≥95%, recall ≥85% on latest set
- [ ] Privacy review (DPDP/GDPR) signed off; purge jobs verified
- [ ] Forensic PDF validated by one external investigator
- [ ] Report links verified per target country
- [ ] Cost model: measured $/scan ≤ $0.04 at 10k scans/day load test
- [ ] Incident response runbook (provider breach, false positive on major brand) rehearsed

## Appendix B — Per-scan data budget (reference, premium tiers)

| Provider | Plan type | Est. unit cost/scan |
|---|---|---|
| WHOISXML | subscription, bulk | ~$0.002 |
| VirusTotal (enterprise) | subscription | ~$0.005 |
| ZeroBounce | credits | ~$0.003 |
| Hunter.io | subscription | ~$0.001 |
| SerpAPI | credits | ~$0.01–0.02 |
| OpenCorporates | subscription | ~$0.002 |
| AbuseIPDB Pro | subscription | ~$0.001 |
| Twilio Lookup | per-lookup | ~$0.005–0.01 |
| HIBP | subscription | ~$0.001 |
| **Blended total** | | **~$0.03–0.04** |
