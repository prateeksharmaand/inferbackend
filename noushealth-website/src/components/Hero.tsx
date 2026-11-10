import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { Button } from './Button'
import { HeroVisual } from './HeroVisual'
import { heroStats } from '../data/site'

export function Hero() {
  const reduce = useReducedMotion()
  const item = (d: number) => ({ initial: reduce ? false : { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: [0.22, 1, 0.36, 1] as const } })
  return (
    <section className="relative overflow-hidden bg-ink pb-20 pt-32 sm:pt-40 lg:pb-28" aria-labelledby="hero-title">
      <div className="grid-bg absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="animate-drift absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-brand/30 blur-[100px]" aria-hidden="true" />
      <div className="animate-drift absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-sky/20 blur-[100px] [animation-direction:alternate-reverse]" aria-hidden="true" />
      <div className="container-x relative grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <motion.p {...item(0)} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Software · Cloud · AI
          </motion.p>
          <motion.h1 id="hero-title" {...item(0.08)} className="text-4xl font-extrabold leading-[1.08] !text-white sm:text-5xl lg:text-[3.5rem]">
            We Build Digital Products That <span className="animate-gradient bg-gradient-to-r from-indigo-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">Drive Business Growth</span>
          </motion.h1>
          <motion.p {...item(0.16)} className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            We design, engineer and scale high-performance digital products for startups, growing businesses and enterprises.
          </motion.p>
          <motion.div {...item(0.24)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button to="/contact" arrow>Start a Project</Button>
            <Button to="/case-studies" variant="ghost">Explore Our Work</Button>
          </motion.div>
          <motion.ul {...item(0.32)} className="mt-12 grid max-w-xl grid-cols-1 gap-x-6 gap-y-3 border-t border-white/10 pt-6 min-[420px]:grid-cols-2">
            {heroStats.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm text-slate-300"><Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />{s}</li>
            ))}
          </motion.ul>
        </div>
        <motion.div {...item(0.2)} className="hidden sm:block"><HeroVisual /></motion.div>
      </div>
    </section>
  )
}
