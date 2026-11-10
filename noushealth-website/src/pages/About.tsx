import { PageHero } from '../components/PageHero'
import { AboutSection } from '../components/AboutSection'
import { TeamSection } from '../components/TeamSection'
import { Stats } from '../components/Stats'
import { WhyChoose } from '../components/home/WhyChoose'
import { ClientLogos } from '../components/home/ClientLogos'
import { CTASection } from '../components/CTASection'
import { company } from '../config/company'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

export default function About() {
  useSeo(pageSeo.about)
  return (
    <>
      <PageHero eyebrow="About" title={`${company.companyName}: engineers who care about outcomes`} description={company.tagline} crumbs={[{ label: 'About' }]} />
      <AboutSection />
      <Stats />
      <WhyChoose />
      <TeamSection />
      <div id="partners"><ClientLogos /></div>
      <CTASection />
    </>
  )
}
