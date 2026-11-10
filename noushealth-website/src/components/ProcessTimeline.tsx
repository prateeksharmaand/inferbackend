import { motion } from 'framer-motion'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { Icon } from '../lib/icons'
import { processSteps } from '../data/site'

export function ProcessTimeline({ title = 'From Idea to Impact', dark = false }: { title?: string; dark?: boolean }) {
  return (
    <section className={dark ? 'section bg-ink' : 'section bg-slate-50'} aria-labelledby="process-title">
      <div className="container-x">
        <SectionHeading dark={dark} eyebrow="Our process" title={<span id="process-title">{title}</span>} description="A proven six-stage delivery framework that keeps teams aligned and releases predictable." />
        <ol className="relative mt-14 grid gap-8 lg:grid-cols-6 lg:gap-4">
          <motion.div className="absolute left-[19px] top-2 hidden h-[calc(100%-1rem)] w-px origin-top bg-gradient-to-b from-brand to-accent max-lg:block" aria-hidden="true" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
          <motion.div className="absolute left-[8%] right-[8%] top-5 hidden h-px origin-left bg-gradient-to-r from-brand to-accent lg:block" aria-hidden="true" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
          {processSteps.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 0.08} className="relative flex gap-5 lg:block lg:text-center">
              <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white ring-4 ring-slate-50 lg:mx-auto" style={dark ? { boxShadow: '0 0 0 4px #0b1020' } : undefined}>
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
              <div className="lg:mt-5">
                <p className="font-mono text-xs text-brand">{s.n}</p>
                <h3 className={`mt-1 text-lg font-semibold ${dark ? '!text-white' : ''}`}>{s.title}</h3>
                <p className={`mt-1.5 text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{s.description}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
