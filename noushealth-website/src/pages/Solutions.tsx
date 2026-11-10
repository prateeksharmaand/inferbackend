import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { Icon } from '../lib/icons'
import { Button } from '../components/Button'
import { CTASection } from '../components/CTASection'
import { solutions } from '../data/site'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

export default function Solutions() {
  useSeo(pageSeo.solutions)
  return (
    <>
      <PageHero eyebrow="Solutions" title="Packaged expertise for common business challenges" description="Proven approaches that accelerate delivery and reduce risk." crumbs={[{ label: 'Solutions' }]} />
      <section className="section"><div className="container-x">
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {solutions.map((s, i) => (
            <Reveal as="li" key={s.title} delay={(i % 3) * 0.06} className="card card-hover p-7">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name={s.icon} className="h-6 w-6" /></span>
              <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-slate-600">{s.text}</p>
              <div className="mt-5"><Button to="/contact" variant="secondary" arrow className="!py-2">Talk to an expert</Button></div>
            </Reveal>
          ))}
        </ul>
      </div></section>
      <CTASection />
    </>
  )
}
