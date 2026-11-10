import { PageHero } from '../components/PageHero'
import { IndustriesSection } from '../components/home/IndustriesSection'
import { CTASection } from '../components/CTASection'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

export default function Industries() {
  useSeo(pageSeo.industries)
  return (
    <>
      <PageHero eyebrow="Industries" title="Experience across the sectors that shape business" description="Select an industry to explore related work." crumbs={[{ label: 'Industries' }]} />
      <IndustriesSection heading={false} />
      <CTASection />
    </>
  )
}
