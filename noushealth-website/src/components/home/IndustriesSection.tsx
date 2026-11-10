import { Reveal } from '../Reveal'
import { SectionHeading } from '../SectionHeading'
import { IndustryCard } from '../IndustryCard'
import { industries } from '../../data/industries'

export function IndustriesSection({ heading = true }: { heading?: boolean }) {
  return (
    <section className="section bg-slate-50" aria-labelledby="industries-title">
      <div className="container-x">
        {heading && <SectionHeading eyebrow="Industries" title={<span id="industries-title">Deep domain expertise where it counts</span>} description="Hover or focus a card to see how we help each sector." />}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {industries.map((ind, i) => <Reveal key={ind.slug} delay={(i % 5) * 0.05}><IndustryCard industry={ind} /></Reveal>)}
        </div>
      </div>
    </section>
  )
}
