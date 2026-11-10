import { Counter } from '../Counter'
import { Reveal } from '../Reveal'
import { SectionHeading } from '../SectionHeading'
import { Icon } from '../../lib/icons'
import { benefits, whyStats } from '../../data/site'

export function WhyChoose() {
  return (
    <section className="section" aria-labelledby="why-title">
      <div className="container-x">
        <SectionHeading eyebrow="Why Nous Healthcare" title={<span id="why-title">Technology Partner. Not Just a Vendor.</span>} description="We take ownership of outcomes. Figures below are editable placeholders." />
        <dl className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {whyStats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06} className="card flex flex-col-reverse bg-slate-50 p-5 sm:p-7">
              <dt className="mt-1 text-sm text-slate-500">{s.label}</dt>
              <dd className="font-display text-3xl font-bold text-brand sm:text-5xl"><Counter value={s.value} suffix={s.suffix} /></dd>
            </Reveal>
          ))}
        </dl>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b, i) => (
            <Reveal as="li" key={b.title} delay={(i % 3) * 0.06} className="card card-hover p-6">
              <Icon name={b.icon} className="h-6 w-6 text-brand" />
              <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.description}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
