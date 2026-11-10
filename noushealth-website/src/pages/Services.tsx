import { PageHero } from '../components/PageHero'
import { ServiceCard } from '../components/ServiceCard'
import { Reveal } from '../components/Reveal'
import { ProcessTimeline } from '../components/ProcessTimeline'
import { TechnologyGrid } from '../components/TechnologyGrid'
import { FAQ } from '../components/FAQ'
import { CTASection } from '../components/CTASection'
import { services } from '../data/services'
import { homeFaqs } from '../data/site'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

export default function Services() {
  useSeo(pageSeo.services)
  return (
    <>
      <PageHero eyebrow="Services" title="Technology services built around your business" description="Eight core capabilities, one accountable team." crumbs={[{ label: 'Services' }]} />
      <section className="section"><div className="container-x grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {services.map((s, i) => <Reveal key={s.slug} delay={(i % 4) * 0.06}><ServiceCard service={s} /></Reveal>)}
      </div></section>
      <ProcessTimeline />
      <TechnologyGrid />
      <FAQ items={homeFaqs} />
      <CTASection />
    </>
  )
}
