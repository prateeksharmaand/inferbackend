import { Reveal } from '../Reveal'
import { SectionHeading } from '../SectionHeading'
import { CaseStudyCard } from '../CaseStudyCard'
import { Button } from '../Button'
import { caseStudies } from '../../data/caseStudies'

export function CaseStudiesSection() {
  const featured = caseStudies.find((c) => c.featured) ?? caseStudies[0]
  const rest = caseStudies.filter((c) => c !== featured).slice(0, 3)
  return (
    <section className="section" aria-labelledby="cases-title">
      <div className="container-x">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Case studies" title={<span id="cases-title">Work that moves the numbers</span>} />
          <Button to="/case-studies" variant="secondary" arrow>All case studies</Button>
        </div>
        <Reveal className="mt-12"><CaseStudyCard study={featured} featured /></Reveal>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {rest.map((c, i) => <Reveal key={c.slug} delay={i * 0.08}><CaseStudyCard study={c} /></Reveal>)}
        </div>
      </div>
    </section>
  )
}
