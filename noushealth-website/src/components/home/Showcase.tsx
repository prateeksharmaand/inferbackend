import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { Art } from '../Art'
import { Button } from '../Button'
import { SectionHeading } from '../SectionHeading'
import { showcase } from '../../data/site'
import { cn } from '../../lib/utils'

export function Showcase() {
  const [active, setActive] = useState(showcase[0].id)
  const item = showcase.find((s) => s.id === active) ?? showcase[0]
  const seeds: Record<string, number> = { ai: 13, cloud: 18, mobile: 15, web: 16, data: 11 }

  return (
    <section className="section bg-ink" aria-labelledby="showcase-title">
      <div className="container-x grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <SectionHeading dark eyebrow="Capabilities" title={<span id="showcase-title">One partner across your entire technology stack</span>} />
          <div role="tablist" aria-label="Technology areas" className="mt-8 flex flex-wrap gap-2">
            {showcase.map((s) => (
              <button key={s.id} role="tab" id={`tab-${s.id}`} aria-selected={s.id === active} aria-controls="showcase-panel" onClick={() => setActive(s.id)}
                className={cn('rounded-full border px-4 py-2 text-sm font-medium transition', s.id === active ? 'border-brand bg-brand text-white' : 'border-white/15 text-slate-300 hover:border-white/40 hover:text-white')}>
                {s.label}
              </button>
            ))}
          </div>
          <div id="showcase-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="mt-8 min-h-[250px]">
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                <h3 className="text-2xl font-semibold !text-white">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-300">{item.text}</p>
                <ul className="mt-5 space-y-2.5">
                  {item.points.map((p) => <li key={p} className="flex items-center gap-2.5 text-slate-200"><Check className="h-4 w-4 text-accent" aria-hidden="true" />{p}</li>)}
                </ul>
                <div className="mt-7"><Button to="/services" variant="ghost" arrow>Explore services</Button></div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-brand/20">
          <AnimatePresence mode="wait">
            <motion.div key={active} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              <div className="animate-kenburns h-full w-full"><Art image={{ kind: item.kind, seed: seeds[item.id], alt: `${item.label} technology visualization` }} /></div>
            </motion.div>
          </AnimatePresence>
          <span className="absolute bottom-4 left-4 rounded-full bg-ink/70 px-3 py-1 font-mono text-xs text-accent backdrop-blur">{item.label}</span>
        </div>
      </div>
    </section>
  )
}
