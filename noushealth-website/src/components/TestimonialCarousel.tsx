import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react'
import { Avatar } from './Avatar'
import { SectionHeading } from './SectionHeading'
import { testimonials } from '../data/testimonials'

export function TestimonialCarousel() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduce = useReducedMotion()
  const n = testimonials.length
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n])

  useEffect(() => {
    if (paused || reduce) return
    const t = setInterval(() => go(1), 6000)
    return () => clearInterval(t)
  }, [paused, reduce, go])

  const t = testimonials[i]
  return (
    <section className="section bg-slate-50" aria-roledescription="carousel" aria-label="Client testimonials">
      <div className="container-x">
        <SectionHeading align="center" eyebrow="Testimonials" title="What our clients say" />
        <div className="mx-auto mt-12 max-w-3xl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <div className="card relative min-h-[320px] p-8 sm:p-12" aria-live={paused ? 'polite' : 'off'}>
            <Quote className="absolute right-6 top-6 h-10 w-10 text-brand/10" aria-hidden="true" />
            <AnimatePresence mode="wait">
              <motion.figure key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} aria-roledescription="slide" aria-label={`${i + 1} of ${n}`}>
                <blockquote className="font-display text-xl font-medium leading-relaxed text-ink sm:text-2xl">“{t.quote}”</blockquote>
                <figcaption className="mt-8 flex items-center gap-4">
                  <Avatar name={t.name} />
                  <div>
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.position}, {t.company}</p>
                  </div>
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div className="flex gap-2" role="tablist" aria-label="Choose testimonial">
              {testimonials.map((x, idx) => (
                <button key={x.name} role="tab" aria-selected={idx === i} aria-label={`Testimonial from ${x.name}`} onClick={() => setI(idx)} className={`h-2 rounded-full transition-all ${idx === i ? 'w-8 bg-brand' : 'w-2 bg-slate-300 hover:bg-slate-400'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => go(-1)} aria-label="Previous testimonial" className="grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-white hover:border-brand hover:text-brand"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => go(1)} aria-label="Next testimonial" className="grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-white hover:border-brand hover:text-brand"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
