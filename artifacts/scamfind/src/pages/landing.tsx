import { Link } from 'wouter';
import { ArrowRight, Quote, FileSearch, FolderKanban, FileDown, ShieldCheck, Clock, Eye, Link2Off, Lock, Phone } from 'lucide-react';
import { Logo } from '@/components/shell';
import { useTitle } from '@/lib/auth';
import { PhotoFrame, PhotoCredits, Reveal } from '@/components/landing-photos';

const PATTERNS = [
  { k: 'Pay to be hired', q: '"refundable training and laptop security deposit of Rs 3,999"', d: 'Real employers do not charge candidates to start a job.' },
  { k: 'Overpaid cheque', q: '"deposit the cheque and send the balance by gift cards"', d: 'The cheque bounces days later. The money you sent does not come back.' },
  { k: 'Chat-only interview', q: '"Interviews are held by text chat on Telegram only"', d: 'Avoiding a voice or video call hides who is on the other side.' },
  { k: 'Early identity grab', q: '"share your Aadhaar, PAN and bank account details on WhatsApp"', d: 'Identity documents belong in a verified onboarding system, not a chat.' },
];

const STEPS = [
  { n: '01', icon: FileSearch, t: 'Paste or upload', d: 'Drop in the message, an .eml export or a CSV of several offers. HTML is never run.' },
  { n: '02', icon: Quote, t: 'Read the evidence', d: 'Every flag quotes the exact words that triggered it, with its weight and what it usually means.' },
  { n: '03', icon: FolderKanban, t: 'Keep the case', d: 'Track status, notes and follow-up dates. Export a PDF for a complaint when you need it.' },
];

const PRIVACY = [
  { icon: Lock, t: 'Encrypted at rest', d: 'Offer text, notes and evidence are stored encrypted and tied to your account, so you can pick up a case on any device you sign in from.' },
  { icon: Clock, t: '90 days, or 24 months if escalated', d: 'Routine checks are kept up to 90 days. Mark a case as escalated and it is kept for up to 24 months while you follow up.' },
  { icon: ShieldCheck, t: 'Authorised review only', d: 'A small number of authorised reviewers can open account-owned cases to help with follow-up. Their status and note changes are recorded against their name.' },
  { icon: Link2Off, t: 'Links never opened', d: 'Links in a message are shown defanged as plain text. ScamFind never visits them, and neither should you to "check".' },
];

const label = 'mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-primary/70';

export default function Landing() {
  useTitle('Check a job offer before you trust it');
  return (
    <div className="min-h-[100dvh] overflow-x-hidden">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" data-testid="link-landing-logo" className="text-primary"><Logo /></Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/resources" className="hidden rounded-lg px-3 py-2 hover:bg-primary/10 sm:inline" data-testid="link-landing-resources">Verify & report</Link>
            <Link href="/sign-in" className="rounded-lg px-3 py-2 hover:bg-primary/10" data-testid="link-landing-signin">Sign in</Link>
            <Link href="/sign-up" className="rounded-lg bg-primary px-3.5 py-2 font-medium text-primary-foreground hover:brightness-110" data-testid="link-landing-signup">Create account</Link>
          </nav>
        </div>
      </header>

      {/* HERO — split, photo plainly visible */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-28 md:pt-36 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-primary rise">
              <ShieldCheck className="h-3.5 w-3.5" /> For job seekers, before they reply
            </div>
            <h1 data-testid="text-hero-headline" className="hero-headline text-[2.7rem] font-semibold leading-[1.02] sm:text-6xl lg:text-[4.4rem] rise" style={{ animationDelay: '80ms' }}>
              That offer looks <span className="italic text-[hsl(32_80%_44%)]">perfect.</span><br />Let's read the small print.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground rise" style={{ animationDelay: '160ms' }}>
              ScamFind reads an unexpected job offer the way a careful friend would — quoting the exact lines that worry it, saying plainly what it couldn't check, and keeping your case together until it's resolved.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3 rise" style={{ animationDelay: '240ms' }}>
              <Link href="/sign-up" className="group inline-flex h-12 items-center gap-2 rounded-xl bg-[hsl(38_82%_58%)] px-6 text-base font-semibold text-[hsl(205_40%_12%)] transition-transform hover:-translate-y-0.5" data-testid="link-hero-signup">
                Check my first offer <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/sign-in" className="inline-flex h-12 items-center rounded-xl border border-primary/20 px-5 text-base hover:bg-primary/5" data-testid="link-hero-signin">I have an account</Link>
            </div>
            <p className="mt-5 text-xs text-muted-foreground rise" style={{ animationDelay: '300ms' }}>Free account. Transparent rules, not a black box. A risk indicator — never a guarantee.</p>
          </div>

          <div className="relative rise" style={{ animationDelay: '200ms' }}>
            <div className="absolute -right-6 -top-6 hidden h-40 w-40 rounded-full bg-[hsl(38_82%_58%/0.25)] lg:block" />
            <PhotoFrame src="remote-work.jpg" eager ratio="4 / 5" position="50% 40%" className="relative ml-auto max-w-md shadow-[0_40px_80px_-40px_hsl(194_60%_10%/0.55)]"
              alt="A woman smiles while taking notes beside her laptop and a cappuccino at a sunny cafe counter" testId="img-hero" />
            <div className="absolute -bottom-8 -left-2 w-[17rem] rounded-2xl bg-card p-4 shadow-[0_30px_60px_-30px_hsl(194_60%_8%/0.6)] sm:left-0 lg:-left-10">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Illustrative read</span>
                <span className="rounded-full bg-alert-soft px-2 py-0.5 text-[11px] font-medium text-alert">Likely scam</span>
              </div>
              <div className="mt-2 font-display text-base font-semibold">Data Entry Associate</div>
              <blockquote className="mt-2 rounded-md border-l-[3px] border-accent bg-accent/10 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">{PATTERNS[0].q}</blockquote>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Eye className="h-3 w-3" /> Example content, not a real scan.</div>
            </div>
          </div>
        </div>
      </section>

      {/* PHOTO BAND — home */}
      <section className="mx-auto max-w-6xl px-5 pt-16">
        <Reveal>
          <div className="relative">
            <PhotoFrame src="home-work.jpg" ratio="16 / 8" position="50% 45%" className="min-h-[340px]"
              alt="A woman in glasses sips from a mug while reading on her laptop, seated on a grey sofa at home" testId="img-home" />
            <div className="relative -mt-16 ml-4 max-w-md rounded-2xl bg-sidebar p-6 text-[hsl(40_38%_95%)] md:absolute md:bottom-8 md:right-8 md:mt-0 md:ml-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(38_82%_68%)]">The quiet moment</div>
              <p className="mt-2 font-display text-2xl leading-snug">Most offers arrive when you're on your own, hopeful, and short on time. That's exactly when a second read helps.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* STEPS */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="max-w-2xl">
          <div className={label}>How it works</div>
          <h2 className="text-3xl font-semibold leading-tight md:text-5xl">Three calm steps between <span className="italic text-primary">"congratulations"</span> and your reply.</h2>
        </div>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120} className={i === 1 ? 'md:translate-y-10' : i === 2 ? 'md:translate-y-20' : ''}>
              <div className="flex items-baseline gap-3 border-t pt-5">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 text-2xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PATTERNS with photo */}
      <section className="bg-secondary/60 py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <div className={label}>Learn the patterns</div>
            <h2 className="text-3xl font-semibold leading-tight md:text-4xl">Recruitment fraud repeats itself. Once you've seen the lines, they stand out.</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">These are illustrative phrasings of patterns ScamFind's rules look for. A match is a reason to slow down and verify — not proof.</p>
            <Link href="/resources" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" data-testid="link-patterns-resources">How to verify an employer <ArrowRight className="h-3.5 w-3.5" /></Link>
            <Reveal className="mt-8">
              <PhotoFrame src="career-cafe.jpg" ratio="3 / 2" position="40% 50%" caption="Read before you reply"
                alt="Close view of hands on a laptop trackpad next to a cup of coffee at a wooden cafe table" testId="img-cafe" />
            </Reveal>
          </div>
          <div className="space-y-4">
            {PATTERNS.map((p, i) => (
              <Reveal key={p.k} delay={i * 80}>
                <div className="rounded-2xl border bg-card p-5 transition-transform hover:-translate-y-0.5" data-testid={`card-pattern-${i}`}>
                  <div className="flex items-center justify-between"><h3 className="font-sans text-base font-semibold">{p.k}</h3><span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span></div>
                  <blockquote className="relative mt-3 rounded-lg border-l-[3px] border-accent bg-accent/10 py-2 pl-8 pr-3 font-mono text-[13px]"><Quote className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-accent" />{p.q}</blockquote>
                  <p className="mt-2 text-sm text-muted-foreground">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* VERIFY WITH PEOPLE */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:py-28 lg:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <PhotoFrame src="team-conversation.jpg" ratio="3 / 2" position="60% 40%" caption="A real process has real people"
            alt="Two colleagues talk across an office table covered with folders, a laptop and coffee cups" testId="img-team" />
        </Reveal>
        <Reveal delay={120}>
          <div className={label}>The best check is a human one</div>
          <h2 className="text-3xl font-semibold leading-tight md:text-4xl">Genuine hiring looks like conversations, names and a phone number you can find yourself.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">ScamFind points out what to ask. Then call the company on a number from its own website, and ask whether the role and the recruiter are real.</p>
          <Link href="/resources" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-primary/20 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5" data-testid="link-people-resources"><Phone className="h-4 w-4" /> Verification checklist</Link>
        </Reveal>
      </section>

      {/* PRIVACY */}
      <section className="mx-auto max-w-6xl px-5 pb-20 md:pb-28">
        <div className={label}>Your account, your record</div>
        <h2 className="max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">What happens to what you paste.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border bg-border md:grid-cols-2">
          {PRIVACY.map((c) => (
            <div key={c.t} className="bg-card p-7">
              <c.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-xl font-semibold">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HONESTY */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-8 rounded-3xl border bg-card p-8 md:grid-cols-[auto_1fr] md:p-12">
          <FileDown className="h-8 w-8 text-accent" />
          <div>
            <h2 className="text-2xl font-semibold md:text-3xl">What ScamFind is not.</h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              It is not a trained model or a background check. It runs transparent, weighted rules and the public domain checks that are available, plus an opt-in Google Web Risk lookup of links if you ask for one, and it tells you which checks it could not run. A low score alone does not verify an offer. Always confirm through the company's own website or a phone number you find yourself.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-sidebar text-[hsl(40_38%_95%)]">
        <div className="ledger pointer-events-none absolute inset-0 opacity-[0.06]" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-xl text-3xl font-semibold leading-tight md:text-5xl">A real employer will never ask you to <span className="italic text-[hsl(38_82%_62%)]">pay to get hired.</span></h2>
          <Link href="/sign-up" className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[hsl(38_82%_58%)] px-6 font-semibold text-[hsl(205_40%_12%)]" data-testid="link-cta-signup">Create a free account <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
        </div>
        <footer className="relative border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-[hsl(40_38%_95%/0.55)]">
            <span>ScamFind — an evidence-first companion for job seekers.</span>
            <div className="flex gap-4">
              <Link href="/resources" className="hover:text-white" data-testid="link-footer-resources">Verify & report</Link>
              <Link href="/sign-in" className="hover:text-white" data-testid="link-footer-signin">Sign in</Link>
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-5 pb-6"><PhotoCredits /></div>
        </footer>
      </section>
    </div>
  );
}
