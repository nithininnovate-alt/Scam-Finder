import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { Scan } from "./scamfind-analysis";

export function sendReport(scan: Scan, res: Response) {
  const pdf = new PDFDocument({ margin: 48, size: "A4", info: { Title: `ScamFind evidence report — ${scan.title}`, Author: "ScamFind" } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="scamfind-${scan.id}.pdf"`);
  pdf.pipe(res);
  const title = (value: string) => { pdf.moveDown().font("Helvetica-Bold").fontSize(14).fillColor("#163d33").text(value); pdf.moveDown(0.4).font("Helvetica").fontSize(10).fillColor("#263a36"); };
  const line = (value: string) => { pdf.text(value, { lineGap: 3 }); pdf.moveDown(0.4); };
  pdf.font("Helvetica-Bold").fontSize(26).fillColor("#163d33").text("ScamFind");
  pdf.font("Helvetica").fontSize(12).text("Job offer screening / Evidence report");
  title(scan.title);
  line(`Case: ${scan.id}\nScreened (UTC): ${scan.createdAt}\nEngine: ${scan.engineVersion}\nStatus: ${scan.status}`);
  title(`${scan.verdict} — Risk indicator ${scan.score}/100`);
  line(scan.confidence);
  if (scan.pdfSource) {
    title("PDF text extraction");
    line(`${scan.pdfSource.fileName} / ${scan.pdfSource.pages} page(s)\n${scan.pdfSource.warning}`);
  }
  line("This screening is not proof of fraud or legitimacy and is not a legal finding. No benchmark accuracy claim is made.");
  title("Sender and evidence integrity");
  line(`Sender: ${scan.sender || "Not supplied"}\nDomain: ${scan.domain || "Not supplied"}\nSHA-256 of submitted UTF-8 source text:\n${scan.hash}`);
  line("The hash covers submitted source text, not the original uploaded file bytes. Preserve the original email/file separately. This export is not a certified forensic chain of custody.");
  title("Warning signals");
  if (!scan.signals.length) line("No configured text signals matched. This does not verify legitimacy.");
  for (const signal of scan.signals) {
    line(`${signal.title} (+${signal.weight} rule weight) / ${signal.category}`);
    line(`Evidence: "${signal.evidence}"\n${signal.description}`);
  }
  title("Check coverage");
  for (const check of scan.checks) line(`${check.name} [${check.status}]\n${check.detail}`);
  if (scan.textSearchRequested !== undefined || scan.textSearch) {
    title("Opt-in phrase reuse search");
    if (scan.textSearch) {
      const search = scan.textSearch;
      line(`[${search.status}] ${search.phrase ? `"${search.phrase}"` : ""}\n${search.detail}\nChecked (UTC): ${search.checkedAt}`);
      for (const hit of search.results) line(`${hit.title}\n${hit.url.replace(/^http/i, "hxxp").replace(/\./g, "[.]")}\n${hit.snippet}`);
    } else line("Not requested. No phrase was shared with SerpAPI or Google.");
    line("Source: Google results via SerpAPI. Search results may be incomplete or inexact and do not prove fraud or safety. Result pages were not visited. This check does not change the risk score.");
  }
  if (scan.phoneCheckRequested !== undefined || scan.phoneCheck) {
    title("Phone number validation");
    if (scan.phoneCheck) {
      const check = scan.phoneCheck;
      line(`${check.internationalFormat || check.number} [${check.status}]\nCountry: ${check.countryName || check.countryCode || "Not provided"}; carrier: ${check.carrier || "Not provided"}; line type: ${check.lineType || "Not provided"}\n${check.detail}\nChecked (UTC): ${check.checkedAt}`);
    } else line("Not requested. No phone number was shared with Numverify.");
    line("Phone validity does not verify recruiter identity, ownership or safety and does not change the risk score.");
  }
  if (scan.urlChecks?.length) {
    title("Opt-in Google Web Risk results");
    scan.urlChecks.forEach(check => line(`${check.url.replace(/^http/i, "hxxp").replace(/\./g, "[.]")} [${check.status}]\n${check.threatTypes.join(", ")}\n${check.detail}\nChecked (UTC): ${check.checkedAt}`));
    line("Queries exclude URL query strings and fragments. A no-match result is not proof that a site or offer is safe.");
  }
  title("Your verification checklist");
  scan.checklist.forEach((item, index) => line(`${index + 1}. ${item}`));
  title("Reporting guidance");
  line("India: cybercrime.gov.in / urgent financial fraud helpline 1930\nCERT-In: incident@cert-in.org.in\nUS: reportfraud.ftc.gov\nInternational phishing: reportphishing@apwg.org\nNo complaint has been submitted on your behalf.");
  title("Extracted URLs (not opened; not an endorsement)");
  scan.links.forEach(url => line(url.replace(/^http/i, "hxxp").replace(/\./g, "[.]")));
  if (!scan.links.length) line("No URLs extracted.");
  title("Original headers");
  line(scan.headers || "Not available for this input.");
  title("Normalized offer text");
  line(scan.text);
  title("Case notes");
  line(scan.notes || "No notes recorded.");
  title("Timeline (UTC)");
  scan.timeline.forEach(item => line(`${item.at}\n${item.description}`));
  pdf.end();
}
