import { Link, Navigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { PageHero } from '../components/PageHero'
import { Button } from '../components/Button'
import { Reveal } from '../components/Reveal'
import { SectionHeading } from '../components/SectionHeading'
import { TechChip } from '../components/TechnologyGrid'
import { ProcessTimeline } from '../components/ProcessTimeline'
import { CaseStudyCard } from '../components/CaseStudyCard'
import { FAQ } from '../components/FAQ'
import { CTASection } from '../components/CTASection'
import { Icon } from '../lib/icons'
import { getService, services } from '../data/services'
import { caseStudies } from '../data/caseStudies'
import { useSeo } from '../hooks/useSeo'

export default function ServiceDetail() {
  const { slug = '' } = useParams()
  const service = getService(slug)
  useSeo({ title: `${service?.title ?? 'Service'} — Nous Healthcare`, description: service?.overview ?? '', path: `/services/${slug}` })
  if (!service) return <Navigate to="/404" replace />
  const related = caseStudies.filter((c) => service.relatedCaseStudies.includes(c.slug))
  const others = services.filter((s) => s.slug !== slug)

  return (
    <>
      <PageHero eyebrow={service.title} title={service.headline} description={service.short} crumbs={[{ label: 'Services', to: '/services' }, { label: service.title }]}>
        <Button to="/contact" arrow>Discuss your project</Button>
      </PageHero>

      <section className="section" aria-labelledby="overview">
        <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeading eyebrow="Overview" title={<span id="overview">What we deliver</span>} description={service.overview} />
          <ul className="grid gap-4 sm:grid-cols-2">
            {service.capabilities.map((c, i) => (
              <Reveal as="li" key={c.title} delay={i * 0.06} className="card p-5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name={service.icon} className="h-4 w-4" /></span>
                <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{c.description}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="section bg-slate-50" aria-labelledby="tech">
        <div className="container-x">
          <SectionHeading eyebrow="Technologies" title={<span id="tech">Tools we use</span>} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{service.technologies.map((t) => <TechChip key={t} name={t} />)}</ul>
        </div>
      </section>

      <ProcessTimeline title="How we deliver" />

      <section className="section" aria-labelledby="benefits">
        <div className="container-x">
          <SectionHeading eyebrow="Benefits" title={<span id="benefits">Why teams choose us for this</span>} />
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {service.benefits.map((b, i) => (
              <Reveal as="li" key={b.title} delay={i * 0.06} className="flex gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div><h3 className="text-base font-semibold">{b.title}</h3><p className="mt-1 text-sm text-slate-600">{b.description}</p></div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {related.length > 0 && (
        <section className="section bg-slate-50" aria-labelledby="related">
          <div className="container-x">
            <SectionHeading eyebrow="Proof" title={<span id="related">Related case studies</span>} />
            <div className="mt-10 grid gap-5 md:grid-cols-2">{related.map((c) => <CaseStudyCard key={c.slug} study={c} />)}</div>
          </div>
        </section>
      )}

      <FAQ items={service.faqs} id="faq" title={`${service.title} FAQ`} />

      <section className="pb-12" aria-label="Other services">
        <div className="container-x flex flex-wrap gap-2 text-sm">
          <span className="text-slate-500">Also explore:</span>
          {others.map((s) => <Link key={s.slug} to={`/services/${s.slug}`} className="rounded-full border border-slate-200 px-3 py-1 hover:border-brand hover:text-brand">{s.title}</Link>)}
        </div>
      </section>
      <CTASection />
    </>
  )
}
