import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { technologies } from '../data/technologies'

const badge = (name: string) => {
  const words = name.replace(/[.#]/g, ' ').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.map((w) => w[0]).join('') : name.slice(0, 2)).slice(0, 3)
}

export function TechChip({ name }: { name: string }) {
  return (
    <li className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand/40 hover:shadow-md">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 font-mono text-[11px] font-semibold text-slate-500 transition group-hover:bg-brand group-hover:text-white" aria-hidden="true">{badge(name)}</span>
      <span className="text-sm font-medium text-ink">{name}</span>
    </li>
  )
}

export function TechnologyGrid() {
  return (
    <section className="section" aria-labelledby="tech-heading">
      <div className="container-x">
        <SectionHeading eyebrow="Technology stack" title={<span id="tech-heading">Modern tools, chosen deliberately</span>} description="We select technology for fit, longevity and team velocity — not trends." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {technologies.map((cat, i) => (
            <Reveal key={cat.name} delay={i * 0.05} className="card p-5">
              <h3 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-brand">{cat.name}</h3>
              <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">{cat.items.map((t) => <TechChip key={t} name={t} />)}</ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
