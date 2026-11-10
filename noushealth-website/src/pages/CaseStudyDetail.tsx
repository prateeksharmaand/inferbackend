import { Navigate, useParams } from 'react-router-dom'
import { PageHero } from '../components/PageHero'
import { Art } from '../components/Art'
import { ImageReveal } from '../components/ImageReveal'
import { Button } from '../components/Button'
import { Reveal } from '../components/Reveal'
import { SectionHeading } from '../components/SectionHeading'
import { CaseStudyCard } from '../components/CaseStudyCard'
import { CTASection } from '../components/CTASection'
import { caseStudies, getCaseStudy } from '../data/caseStudies'
import { useSeo } from '../hooks/useSeo'

export default function CaseStudyDetail() {
  const { slug = '' } = useParams()
  const c = getCaseStudy(slug)
  useSeo({ title: `${c?.title ?? 'Case study'} — Nous Healthcare`, description: c?.summary ?? '', path: `/case-studies/${slug}` })
  if (!c) return <Navigate to="/404" replace />
  const more = caseStudies.filter((x) => x.slug !== slug).slice(0, 2)

  return (
    <>
      <PageHero eyebrow={`${c.industry} · ${c.client}`} title={c.title} description={c.summary} crumbs={[{ label: 'Case Studies', to: '/case-studies' }, { label: c.title }]} />
      <section className="container-x -mt-10 relative z-10">
        <ImageReveal className={`overflow-hidden rounded-2xl shadow-2xl ${c.image.src?.startsWith('/') ? 'mx-auto aspect-[5/3] max-w-4xl' : 'aspect-[16/9] sm:aspect-[21/9]'}`}><Art image={c.image} /></ImageReveal>
        <dl className="mt-8 grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
          {c.metrics.map((m) => <div key={m.label} className="flex flex-col-reverse text-center"><dt className="text-xs text-slate-500 sm:text-sm">{m.label}</dt><dd className="font-display text-2xl font-bold text-brand sm:text-4xl">{m.value}</dd></div>)}
        </dl>
      </section>

      <section className="section" aria-labelledby="challenge">
        <div className="container-x grid gap-12 lg:grid-cols-2">
          <Reveal><p className="eyebrow mb-3">Challenge</p><h2 id="challenge" className="text-2xl font-bold sm:text-3xl">The problem</h2><p className="mt-4 leading-relaxed">{c.challenge}</p></Reveal>
          <Reveal delay={0.08}><p className="eyebrow mb-3">Solution</p><h2 className="text-2xl font-bold sm:text-3xl">Our approach</h2><p className="mt-4 leading-relaxed">{c.solution}</p></Reveal>
        </div>
      </section>

      <section className="section bg-slate-50" aria-labelledby="arch">
        <div className="container-x grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Architecture" title={<span id="arch">How it fits together</span>} />
            <ol className="mt-8 space-y-3">
              {c.architecture.map((a, i) => <Reveal as="li" key={a} delay={i * 0.05} className="card flex items-center gap-4 p-4"><span className="grid h-8 w-8 place-items-center rounded-md bg-brand/10 font-mono text-xs text-brand">{i + 1}</span>{a}</Reveal>)}
            </ol>
          </div>
          <div>
            <SectionHeading eyebrow="Technology stack" title="Built with" />
            <ul className="mt-8 flex flex-wrap gap-2">{c.technologies.map((t) => <li key={t} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm">{t}</li>)}</ul>
            <h3 className="mt-10 text-lg font-semibold">Development process</h3>
            <ol className="mt-4 space-y-4 border-l border-slate-300 pl-5">
              {c.process.map((p) => <li key={p.phase} className="relative"><span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" /><p className="font-semibold text-ink">{p.phase}</p><p className="text-sm text-slate-600">{p.detail}</p></li>)}
            </ol>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="results">
        <div className="container-x">
          <SectionHeading eyebrow="Results" title={<span id="results">Business impact</span>} />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">{c.results.map((r, i) => <Reveal as="li" key={r} delay={i * 0.06} className="card p-6 font-medium text-ink">{r}</Reveal>)}</ul>
          <h3 className="mb-4 mt-14 text-xl font-semibold">Screenshots</h3>
          <div className="grid gap-4 sm:grid-cols-3">{c.screenshots.map((s, i) => <ImageReveal key={i} delay={i * 0.12} className="aspect-[3/2] overflow-hidden rounded-xl border border-slate-200"><Art image={s} /></ImageReveal>)}</div>
          <div className="mt-12"><Button to="/contact" arrow>Start a similar project</Button></div>
        </div>
      </section>

      <section className="section bg-slate-50 !pt-16" aria-label="More case studies"><div className="container-x"><h2 className="mb-8 text-2xl font-bold">More case studies</h2><div className="grid gap-5 md:grid-cols-2">{more.map((m) => <CaseStudyCard key={m.slug} study={m} />)}</div></div></section>
      <CTASection />
    </>
  )
}
