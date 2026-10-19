import { ExternalLink, Phone, Mail } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PageHeader } from '@/components/shell';

const VERIFY = [
  ['Find the company yourself', 'Search for the employer independently and open their official careers page. Do not use links or phone numbers from the message.'],
  ['Match the recruiter', 'Check that the recruiter appears on the company site or a professional profile with history, and that their email uses the company domain.'],
  ['Call a number you looked up', "Phone the company's main line from their official site and ask whether the role and person exist."],
  ['Never pay to be hired', 'Training fees, laptop deposits, visa processing or "refundable" charges are the most common recruitment-scam pattern.'],
  ['Hold your documents', 'Share ID, PAN, Aadhaar, SSN or bank details only after a verified written offer through official channels.'],
  ['Be wary of cheques', 'A cheque to buy equipment, with the balance sent elsewhere, is a known pattern — the cheque usually bounces later.'],
];

const AUTH = [
  { name: 'National Cyber Crime Reporting Portal', where: 'India', href: 'https://cybercrime.gov.in', extra: 'Helpline 1930 for financial fraud — call quickly if money moved.', icon: Phone },
  { name: 'CERT-In', where: 'India', href: 'https://www.cert-in.org.in', extra: 'Incident email: incident@cert-in.org.in', icon: Mail, mail: 'mailto:incident@cert-in.org.in' },
  { name: 'FTC ReportFraud', where: 'United States', href: 'https://reportfraud.ftc.gov', extra: 'Reports help investigators spot patterns.' },
  { name: 'Anti-Phishing Working Group', where: 'International', href: 'https://apwg.org/reportphishing/', extra: 'Forward phishing emails to reportphishing@apwg.org.' },
];

const MAIL = [
  ['Gmail', 'Open the message, click the three-dot menu beside Reply, then choose "Report phishing". On mobile, tap the three dots at the top right.'],
  ['Outlook', 'Select the message, then choose Report > Report phishing in the ribbon (or right-click > Report > Report phishing). On Outlook.com, use the Junk menu > Phishing.'],
  ['Yahoo Mail', 'Open the message, click the three-dot "More" menu, choose "Report spam", then follow the prompt to mark it as phishing if offered.'],
];

export default function Resources() {
  return (
    <>
      <PageHeader eyebrow="Plain-language guidance" title={<>Verify calmly. <span className="italic text-primary">Report if you choose.</span></>} />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section className="rise">
          <h2 className="mb-4 text-2xl font-semibold">Six ways to verify an offer</h2>
          <ol className="space-y-3">
            {VERIFY.map(([t, d], i) => (
              <li key={t} className="flex gap-4 rounded-xl border bg-card p-4">
                <span className="font-display text-3xl font-semibold leading-none text-accent">{String(i + 1).padStart(2, '0')}</span>
                <div><div className="font-medium">{t}</div><p className="mt-0.5 text-sm text-muted-foreground">{d}</p></div>
              </li>
            ))}
          </ol>
        </section>
        <div className="space-y-8">
          <section className="rise" style={{ animationDelay: '80ms' }}>
            <h2 className="mb-1 text-2xl font-semibold">Where to report</h2>
            <p className="mb-4 text-sm text-muted-foreground">Official sites, opened by you. ScamFind never files complaints on your behalf.</p>
            <div className="space-y-2.5">
              {AUTH.map((a) => (
                <div key={a.name} className="rounded-xl border bg-card p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{a.where}</div>
                  <a href={a.href} target="_blank" rel="noopener noreferrer" className="group mt-0.5 flex items-center gap-1.5 font-medium hover:text-primary" data-testid={`link-authority-${a.where.toLowerCase().replace(/ /g, '-')}-${a.name.split(' ')[0].toLowerCase()}`}>
                    {a.name} <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.mail ? <a href={a.mail} className="text-primary hover:underline">{a.extra}</a> : a.extra}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="rise" style={{ animationDelay: '140ms' }}>
            <h2 className="mb-3 text-2xl font-semibold">Report it in your inbox</h2>
            <Accordion type="single" collapsible className="rounded-xl border bg-card px-4">
              {MAIL.map(([n, d]) => (
                <AccordionItem key={n} value={n}>
                  <AccordionTrigger data-testid={`accordion-${n.toLowerCase().replace(/ /g, '-')}`}>{n}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{d}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
          <div className="rounded-2xl bg-primary p-5 text-sm leading-relaxed text-primary-foreground">
            If you already paid or shared documents, it is not your fault — these schemes are designed to feel legitimate. Contact your bank first, then report. Keep the PDF from your ScamFind report as evidence.
          </div>
        </div>
      </div>
    </>
  );
}
