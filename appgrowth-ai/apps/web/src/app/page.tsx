import { BarChart3, Bot, Lightbulb, Palette, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/app/logo';

const FEATURES = [
  { icon: Lightbulb, title: 'Research, ASO and strategy', body: 'AI market research, competitor and keyword analysis, store listing audits and a month-by-month growth plan with a CPI-based forecast.' },
  { icon: Palette, title: 'Creative studio', body: 'Headlines, ad copy, image and video concepts in your brand voice — checked against your banned claims and approved by your team before use.' },
  { icon: Bot, title: 'Campaign automation', body: 'App install campaigns on Google, Apple, Meta and TikTok through their official APIs, monitored and optimised on a schedule.' },
  { icon: Wallet, title: 'Budget safety', body: 'Daily, monthly and per-campaign caps, a reserve for late reporting, approval rules and an emergency stop. Automation never exceeds your limits.' },
  { icon: BarChart3, title: 'Honest attribution', body: 'First installs, reinstalls, organic and paid, de-duplicated — with SKAdNetwork and AdAttributionKit reported as aggregates, never as user-level data.' },
  { icon: ShieldCheck, title: 'Built for teams', body: 'Organizations, roles, two-factor sign-in, encrypted credentials and a complete audit trail of every change by people and agents.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-muted">Sign in</Link>
          <Link href="/register" className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/90">Start free trial</Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <p className="text-sm font-medium text-primary">For Android and iOS apps</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Grow genuine installs with AI-run campaigns — inside the budget you control.</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">Set a monthly install target and a spending limit. AppGrowth AI researches your market, plans the channel mix, prepares creatives and runs app campaigns, showing you what is realistic for your budget instead of promising numbers it can&apos;t guarantee.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:bg-primary/90">Start a 14-day trial</Link>
            <Link href="/login" className="rounded-lg border px-5 py-3 font-medium hover:bg-muted">Sign in</Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Ad spend is billed by the ad platforms directly to your own ad accounts. Platform subscription is separate.</p>
        </section>
        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6">
                <f.icon className="size-6 text-primary" />
                <h2 className="mt-4 font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-4">
            {['Add your app by store URL, package name or bundle id.', 'Connect your ad accounts with their official sign-in — we never see your passwords.', 'Review the AI growth plan, budget and creatives, and approve.', 'Campaigns run and are optimised within your limits. Daily reports land in your inbox.'].map((s, i) => (
              <li key={i} className="rounded-xl border p-5"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span><p className="mt-3 text-sm">{s}</p></li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Nous Healthcare Solutions · AppGrowth AI</span>
          <a href="https://noushealthcare.online" className="hover:text-foreground">noushealthcare.online</a>
        </div>
      </footer>
    </div>
  );
}
