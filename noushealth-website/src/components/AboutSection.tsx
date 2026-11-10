import { Art } from './Art'
import { Reveal } from './Reveal'
import { ImageReveal } from './ImageReveal'
import { SectionHeading } from './SectionHeading'
import { about } from '../data/site'
import { images } from '../config/images'

export function AboutSection({ pageHeading = false }: { pageHeading?: boolean }) {
  return (
    <section className="section" aria-labelledby="about-title">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading as={pageHeading ? 'h2' : 'h2'} eyebrow="About us" title={<span id="about-title">{about.heading}</span>} description={about.story} />
          <Reveal className="mt-8 rounded-xl border-l-4 border-brand bg-brand/5 p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-brand">Our Mission</p>
            <p className="mt-2 font-display text-lg font-medium leading-snug text-ink">“{about.mission}”</p>
          </Reveal>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Reveal delay={0.05}><h3 className="text-base font-semibold">Vision</h3><p className="mt-1 text-sm leading-relaxed">{about.vision}</p></Reveal>
            <Reveal delay={0.1}><h3 className="text-base font-semibold">Engineering philosophy</h3><p className="mt-1 text-sm leading-relaxed">{about.philosophy}</p></Reveal>
          </div>
        </div>
        <Reveal className="relative">
          <ImageReveal className="aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl shadow-brand/10"><Art image={images.about} /></ImageReveal>
          <ImageReveal delay={0.4} className="absolute -bottom-6 left-4 hidden w-40 overflow-hidden rounded-xl border-4 border-white shadow-xl sm:block sm:aspect-square sm:w-44"><Art image={images.aboutSecondary} /></ImageReveal>
        </Reveal>
      </div>
    </section>
  )
}
