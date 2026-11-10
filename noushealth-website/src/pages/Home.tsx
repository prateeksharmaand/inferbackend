import { Hero } from '../components/Hero'
import { ClientLogos } from '../components/home/ClientLogos'
import { ServicesSection } from '../components/home/ServicesSection'
import { Showcase } from '../components/home/Showcase'
import { WhyChoose } from '../components/home/WhyChoose'
import { IndustriesSection } from '../components/home/IndustriesSection'
import { CaseStudiesSection } from '../components/home/CaseStudiesSection'
import { TechnologyGrid } from '../components/TechnologyGrid'
import { ProcessTimeline } from '../components/ProcessTimeline'
import { AboutSection } from '../components/AboutSection'
import { TeamSection } from '../components/TeamSection'
import { TestimonialCarousel } from '../components/TestimonialCarousel'
import { Stats } from '../components/Stats'
import { FAQ } from '../components/FAQ'
import { CTASection } from '../components/CTASection'
import { homeFaqs } from '../data/site'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

export default function Home() {
  useSeo(pageSeo.home)
  return (
    <>
      <Hero />
      <ClientLogos />
      <ServicesSection />
      <Showcase />
      <WhyChoose />
      <IndustriesSection />
      <CaseStudiesSection />
      <TechnologyGrid />
      <ProcessTimeline />
      <AboutSection />
      <TeamSection />
      <TestimonialCarousel />
      <Stats />
      <FAQ items={homeFaqs} />
      <CTASection />
    </>
  )
}
