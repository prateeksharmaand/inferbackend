import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageHero } from '../components/PageHero'
import { CaseStudyCard } from '../components/CaseStudyCard'
import { Reveal } from '../components/Reveal'
import { CTASection } from '../components/CTASection'
import { caseStudies } from '../data/caseStudies'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

const industries = [...new Set(caseStudies.map((c) => c.industry))]
const techs = [...new Set(caseStudies.flatMap((c) => c.technologies))].sort()

export default function CaseStudies() {
  useSeo(pageSeo.caseStudies)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const industry = params.get('industry') ?? ''
  const tech = params.get('tech') ?? ''

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => caseStudies.filter((c) =>
    (!industry || c.industry === industry) &&
    (!tech || c.technologies.includes(tech)) &&
    (!q || `${c.title} ${c.summary} ${c.client}`.toLowerCase().includes(q.toLowerCase())),
  ), [q, industry, tech])

  const filtering = Boolean(q || industry || tech)
  const featured = !filtering ? filtered.find((c) => c.featured) : undefined
  const rest = filtered.filter((c) => c !== featured)
  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink focus:border-brand'

  return (
    <>
      <PageHero eyebrow="Case studies" title="Selected work and measurable outcomes" description="Selected projects across healthcare, manufacturing, retail and enterprise." crumbs={[{ label: 'Case Studies' }]} />
      <section className="section !pt-12">
        <div className="container-x">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="relative">
              <label htmlFor="cs-search" className="sr-only">Search case studies</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id="cs-search" type="search" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Search projects…" className={`${field} pl-9`} />
            </div>
            <div><label htmlFor="cs-ind" className="sr-only">Industry</label>
              <select id="cs-ind" value={industry} onChange={(e) => set('industry', e.target.value)} className={field}><option value="">All industries</option>{industries.map((i) => <option key={i}>{i}</option>)}</select></div>
            <div><label htmlFor="cs-tech" className="sr-only">Technology</label>
              <select id="cs-tech" value={tech} onChange={(e) => set('tech', e.target.value)} className={field}><option value="">All technologies</option>{techs.map((i) => <option key={i}>{i}</option>)}</select></div>
            <button type="button" onClick={() => setParams({}, { replace: true })} disabled={!filtering} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:border-brand hover:text-brand disabled:opacity-40">Reset</button>
          </form>
          <p className="mt-4 text-sm text-slate-500" role="status">{filtered.length} project{filtered.length === 1 ? '' : 's'}</p>

          {featured && <Reveal className="mt-8"><CaseStudyCard study={featured} featured /></Reveal>}
          {rest.length > 0 ? (
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((c, i) => <Reveal key={c.slug} delay={(i % 3) * 0.06}><CaseStudyCard study={c} /></Reveal>)}
            </div>
          ) : !featured && (
            <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="font-display text-lg font-semibold text-ink">No projects match your filters</p>
              <button onClick={() => setParams({}, { replace: true })} className="mt-3 text-sm font-medium text-brand">Clear filters</button>
            </div>
          )}
        </div>
      </section>
      <CTASection />
    </>
  )
}
