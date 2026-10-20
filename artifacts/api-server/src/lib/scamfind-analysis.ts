import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import { convert } from "html-to-text";
import { CreateScanBody, GetScanResponse } from "@workspace/api-zod";
import { getDomain } from "tldts";
import { digest } from "./scamfind-crypto";
import { ENGINE_VERSION, rules } from "./scamfind-rules";
import { enrichDomain, validDomain } from "./scamfind-enrichment";
import { checkOfferLinks } from "./scamfind-webrisk";
import { checkPhoneNumber } from "./scamfind-numverify";

export type Scan = ReturnType<typeof GetScanResponse.parse>;
type Input = ReturnType<typeof CreateScanBody.parse>;
const freeMail = new Set(["gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com", "aol.com", "icloud.com", "proton.me", "protonmail.com", "mail.com", "rediffmail.com"]);
const extractEmail = (text: string) => text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? "";
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

function stripHtml(text: string): string {
  return convert(text, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: false } }, { selector: "img", format: "skip" }] });
}

export async function analyse(input: Input): Promise<Scan> {
  const started = Date.now();
  let text = input.text;
  let sender = input.sender?.trim().toLowerCase() ?? "";
  let headers = "";
  let replyTo = "";
  let subject = "";
  let attachmentNames: string[] = [];
  const isEmail = input.fileName?.toLowerCase().endsWith(".eml") || /^(?:From|MIME-Version|Return-Path|Received|Delivered-To):/im.test(text.slice(0, 4000)) && /\r?\n\r?\n/.test(text);
  if (isEmail) {
    const parsed = await simpleParser(text, { skipHtmlToText: true, skipTextToHtml: true, maxHtmlLengthToParse: 200000 });
    headers = parsed.headerLines.map(h => h.line).join("\n");
    sender ||= parsed.from?.value[0]?.address?.toLowerCase() ?? "";
    replyTo = parsed.replyTo?.value[0]?.address ?? "";
    subject = parsed.subject ?? "";
    text = parsed.text || (parsed.html ? stripHtml(parsed.html) : "");
    attachmentNames = parsed.attachments.map(a => a.filename ?? "unnamed attachment");
    // Attachment bytes are never stored, executed, rendered, or sent to a third party.
  } else if (input.fileName?.toLowerCase().endsWith(".html") || /<(?:html|body|p|div|a)\b/i.test(text)) {
    text = stripHtml(text);
  }
  if (sender) sender = extractEmail(sender);
  if (!sender) {
    const explicitSender = input.text.match(/^(?:sender|from)\s*:\s*(.+)$/im)?.[1];
    if (explicitSender) sender = extractEmail(explicitSender);
  }
  text = text.trim();
  if (!text) throw new Error("The offer contains no readable text. Paste the message body or upload a text-based email.");
  const domain = domainOf(sender);
  const content = `${text}\n${attachmentNames.join("\n")}`;
  const signals: Scan["signals"] = [];
  for (const rule of rules) {
    const match = rule.pattern.exec(content);
    if (!match) continue;
    const start = Math.max(0, match.index - 70);
    const end = Math.min(content.length, match.index + match[0].length + 90);
    // Avoid the most common false positive: explicit advice not to pay/share.
    const sentenceStart = Math.max(content.lastIndexOf(".", match.index - 1), content.lastIndexOf("\n", match.index - 1), content.lastIndexOf("!", match.index - 1)) + 1;
    const prefix = content.slice(sentenceStart, match.index);
    const local = content.slice(sentenceStart, end);
    if (["Money requests", "Data harvesting", "Attachment risk"].includes(rule.category)
      && (/\b(?:never|do not|don't|will not|won't|not required|no need to)\b/i.test(prefix)
        || /\b(?:we (?:do not|never|don't)|no (?:fees?|payments?|deposits?) (?:are |is )?(?:required|requested)|not (?:required|requested))\b/i.test(local))) continue;
    signals.push({ id: rule.id, title: rule.title, category: rule.category, weight: rule.weight, evidence: content.slice(start, end), description: rule.description });
  }
  const addDomain = (id: string, evidence: string) => {
    const rule = rules.find(r => r.id === id)!;
    signals.push({ id, title: rule.title, category: rule.category, weight: rule.weight, evidence, description: rule.description });
  };
  const registrable = getDomain(domain) ?? domain;
  if (freeMail.has(registrable)) addDomain("personal-domain", sender);
  if (replyTo && domainOf(replyTo) && domainOf(replyTo) !== domain) addDomain("reply-mismatch", `From: ${sender}; Reply-To: ${replyTo}`);
  if (domain.includes("xn--")) addDomain("punycode", domain);
  if (/(?:career|hiring|recruit|hr-|job-)/i.test(domain)) addDomain("domain-bait", domain);
  const intel = await enrichDomain(domain);
  const links = Array.from(new Set(content.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [])).slice(0, 100);
  const urlChecks = await checkOfferLinks(links, !!input.checkLinks);
  const phoneCheck = await checkPhoneNumber(input.phoneNumber, input.phoneCountry, !!input.checkPhone);
  const listed = urlChecks.filter(check => check.status === "listed");
  if (listed.length) signals.push({
    id: "webrisk-listed", title: "A link is listed by Google Web Risk", category: "Link reputation", weight: 80,
    evidence: listed.map(check => `${check.url}: ${check.threatTypes.join(", ")}`).join("\n"),
    description: "A normalized URL matched a current malware, social engineering or unwanted software list. This is external threat-list evidence, not a probability or proof about the entire job offer.",
  });
  const checks: Scan["checks"] = [
    { name: "Weighted text analysis", status: signals.length ? "warning" : "passed", detail: `${rules.length} rules evaluated. ${signals.length} warning signals found. This is not a trained or benchmark-calibrated model.` },
    { name: "Sender mail records", status: intel.mx === "found" ? "passed" : intel.mx === "missing" ? "warning" : "unavailable", detail: intel.mxDetail },
    { name: "Domain registration age", status: intel.ageDays === undefined ? "unavailable" : intel.ageDays < 180 ? "warning" : "info", detail: intel.rdapDetail },
    {
      name: "URL reputation", status: listed.length ? "warning" : urlChecks.some(check => check.status === "not_listed") ? "info" : "unavailable",
      detail: !input.checkLinks ? "Not requested. Link lookups require your explicit opt-in; no offer links were visited."
        : !links.length ? "No HTTP(S) URLs were extracted. No Web Risk lookup was performed."
        : `${urlChecks.filter(check => ["listed", "not_listed"].includes(check.status)).length} URL(s) checked against Google Web Risk; ${listed.length} listed. At most 5 normalized public URLs are queried, without query strings/fragments. Unavailable or skipped results are not clean results. No links were visited and no-match does not establish safety.`,
    },
    { name: "Mailbox ownership and company identity", status: "unavailable", detail: "Email verification, company-domain matching and company registry services are not connected." },
    { name: "Phone number validation", status: phoneCheck?.status === "valid" ? "info" : phoneCheck?.status === "invalid" ? "warning" : "unavailable",
      detail: phoneCheck?.detail ?? "Not requested. No phone number was shared with Numverify. Phone lookup requires separate explicit consent and does not verify recruiter identity." },
    { name: "IP reputation and text reuse", status: "unavailable", detail: "AbuseIPDB and exact-phrase search are not connected." },
    { name: "Attachment malware check", status: "unavailable", detail: attachmentNames.length ? `${attachmentNames.length} attachment(s) identified: ${attachmentNames.join(", ")}. Not executed or malware-scanned; bytes are not retained.` : "No malware-scanning service is connected. Text-only screening does not establish attachment safety." },
    { name: "ML classifier", status: "unavailable", detail: "No trained model is connected. ML contributes no score." },
  ];
  const ruleScore = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  let enrichmentScore = 0;
  if (intel.ageDays !== undefined && intel.ageDays < 180) enrichmentScore += 25;
  if (intel.mx === "missing") enrichmentScore += 10;
  const hasEnrichment = intel.ageDays !== undefined || intel.mx !== "unavailable";
  // Redistribute weights among available components, never give missing services a clean result.
  let score = Math.round(hasEnrichment ? (0.45 * ruleScore + 0.35 * Math.min(100, enrichmentScore / 60 * 100)) / 0.8 : ruleScore);
  if (signals.some(s => s.category === "Money requests")) score = Math.max(60, score);
  if (freeMail.has(registrable)) score = Math.max(40, score);
  if (listed.length) score = Math.max(80, score);
  score = Math.min(100, Math.max(0, score));
  let verdict: Scan["verdict"] = score >= 55 ? "Likely scam" : score >= 25 ? "Suspicious" : "Likely genuine";
  if (!listed.length && ((text.length < 100 && !validDomain(domain)) || (score < 25 && intel.mx !== "found" && intel.ageDays === undefined))) verdict = "Insufficient data";
  const now = new Date().toISOString();
  const status = verdict === "Likely genuine" ? "closed" : "new";
  const checklist = [
    "Find the employer's official website independently, not through links in this offer. Compare the careers listing and recruiter contact details.",
    "Call the employer using a phone number from its independently verified website or company registry.",
    "Do not pay recruitment fees or share passwords, one-time codes, identity documents or bank details with an unverified recruiter.",
    ...(domain ? [`Verify that ${domain} is an authorized recruiting domain; mail records alone do not establish this.`] : ["Add the original sender email address or upload the complete .eml file for sender-domain checks."]),
    ...(verdict === "Likely scam" ? ["Do not reply. Preserve the original message and contact your bank immediately if money or banking data was shared.", "If you lost money in India, call 1930 immediately and report at cybercrime.gov.in."] : []),
  ];
  return GetScanResponse.parse({
    id: randomUUID(), title: input.title?.trim() || subject || input.fileName || "Job offer screening",
    text, sender, domain, source: input.source ?? "paste", createdAt: now, score, verdict,
    confidence: `Reduced confidence — rules, available public domain checks${urlChecks.some(check => ["listed", "not_listed"].includes(check.status)) ? " and opt-in Google Web Risk lookups" : ""} only. Identity verification, attachment malware analysis and ML checks have not run. Risk is an indicator, not a probability or guarantee.`,
    status, notes: "", feedback: "", dueAt: new Date(Date.now() + (verdict === "Likely scam" ? 4 : verdict === "Insufficient data" ? 72 : 24) * 3600000).toISOString(),
    signals, checks, checklist, links, headers, urlChecks, linkCheckRequested: !!input.checkLinks,
    phoneCheck, phoneCheckRequested: !!input.checkPhone,
    hash: digest(input.text), engineVersion: ENGINE_VERSION, durationMs: Date.now() - started,
    timeline: [{ at: now, description: "Source text received; SHA-256 recorded. Uploaded text is hashed as submitted UTF-8, not as a byte-for-byte forensic file." }, { at: new Date().toISOString(), description: `Screened with ${ENGINE_VERSION}; verdict: ${verdict}. Unavailable providers recorded.` }],
  });
}
