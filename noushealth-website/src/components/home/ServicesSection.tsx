import { Reveal } from '../Reveal'
import { SectionHeading } from '../SectionHeading'
import { ServiceCard } from '../ServiceCard'
import { services } from '../../data/services'

export function ServicesSection() {
  return (
    <section className="section" aria-labelledby="services-title">
      <div className="container-x">
        <SectionHeading eyebrow="What we do" title={<span id="services-title">Technology Services Built Around Your Business</span>} description="End-to-end capabilities from strategy to scale, delivered by cross-functional teams." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => <Reveal key={s.slug} delay={(i % 4) * 0.06}><ServiceCard service={s} /></Reveal>)}
        </div>
      </div>
    </section>
  )
}
