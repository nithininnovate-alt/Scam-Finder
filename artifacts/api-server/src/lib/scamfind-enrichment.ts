import { Resolver } from "node:dns/promises";
import { getDomain } from "tldts";

export interface DomainIntel {
  mx: "found" | "missing" | "unavailable";
  mxDetail: string;
  ageDays?: number;
  registeredAt?: string;
  rdapDetail: string;
}
const cache = new Map<string, { until: number; value: DomainIntel }>();

export function validDomain(value: string): boolean {
  return value.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value)
    && !value.includes("..") && !!getDomain(value) && !/^\d+(?:\.\d+){3}$/.test(value);
}

export async function enrichDomain(domain: string): Promise<DomainIntel> {
  if (!validDomain(domain)) return { mx: "unavailable", mxDetail: "No valid public sender domain supplied.", rdapDetail: "No verifiable sender domain." };
  const existing = cache.get(domain);
  if (existing && existing.until > Date.now()) return existing.value;
  const resolver = new Resolver({ timeout: 2500, tries: 1 });
  const [mx, rdap] = await Promise.allSettled([
    resolver.resolveMx(domain),
    (async () => {
      const registrationDomain = getDomain(domain)!;
      // Fixed reputation/registry destination only. Never fetch an offer's URL.
      const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(registrationDomain)}`, { signal: AbortSignal.timeout(5000), headers: { accept: "application/rdap+json" } });
      if (!response.ok) throw new Error("RDAP unavailable");
      const result = await response.json() as { events?: { eventAction?: string; eventDate?: string }[] };
      const event = result.events?.find(e => e.eventAction === "registration");
      if (!event?.eventDate || !Number.isFinite(Date.parse(event.eventDate))) throw new Error("Registration date unavailable");
      return { registeredAt: event.eventDate, ageDays: Math.max(0, Math.floor((Date.now() - Date.parse(event.eventDate)) / 86400000)) };
    })(),
  ]);
  const value: DomainIntel = { mx: "unavailable", mxDetail: "DNS check unavailable. Email validity is unverified.", rdapDetail: "Registration age unavailable from RDAP." };
  if (mx.status === "fulfilled") {
    const hosts = mx.value.filter(record => record.exchange && record.exchange !== ".");
    value.mx = hosts.length ? "found" : "missing";
    value.mxDetail = hosts.length ? `Mail servers found: ${hosts.map(r => r.exchange).join(", ")}. This does not verify the mailbox or recruiter.` : "No usable MX mail server was found.";
  } else if (["ENODATA", "ENOTFOUND"].includes((mx.reason as { code?: string }).code ?? "")) {
    value.mx = "missing";
    value.mxDetail = "No MX record found. This is a caution, not conclusive proof that a mailbox is invalid.";
  }
  if (rdap.status === "fulfilled") {
    Object.assign(value, rdap.value);
    value.rdapDetail = `Registered ${rdap.value.registeredAt}; ${rdap.value.ageDays} days old at scan time. Domain age does not establish company identity.`;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(domain, { value, until: Date.now() + (value.ageDays === undefined || value.mx === "unavailable" ? 60000 : 86400000) });
  return value;
}

export const providers = [
  { name: "ScamFind rules", capability: "Weighted text signals", status: "active", description: "42 versioned signals across 9 risk categories. Not benchmark-calibrated." },
  { name: "Public DNS", capability: "Sender-domain mail records", status: "active", description: "Live MX lookup; unavailable results are disclosed. Does not verify mailbox ownership." },
  { name: "Public RDAP", capability: "Domain registration age", status: "active", description: "Registration data queried through rdap.org with a 5-second timeout; registry coverage varies." },
  ...[
    ["WHOISXML", "Commercial WHOIS"],
    ["VirusTotal", "URL and attachment-hash reputation"],
    ["Google Safe Browsing", "Malicious-link reputation"],
    ["AbuseIPDB", "Received-IP reputation"],
    ["ZeroBounce", "Mailbox verification"],
    ["Hunter", "Company-domain matching"],
    ["SerpAPI", "Exact-text reuse search"],
    ["OpenCorporates", "Company registry verification"],
    ["Have I Been Pwned", "Breach intelligence"],
    ["Twilio Lookup", "Phone intelligence"],
    ["Visual search", "Letterhead matching"],
    ["ML classifier", "Trained scam classification"],
  ].map(([name, capability]) => ({ name: name!, capability: capability!, status: "not_connected", description: "Not connected. This check does not contribute to verdicts." })),
];
