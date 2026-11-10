import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SectionHeading } from './SectionHeading'
import type { FAQ as FAQType } from '../data/types'
import { cn } from '../lib/utils'

export function FAQ({ items, id = 'faq', title = 'Frequently asked questions' }: { items: FAQType[]; id?: string; title?: string }) {
  const [open, setOpen] = useState<number | null>(0)
  const base = useId()
  return (
    <section id={id} className="section" aria-labelledby={`${id}-title`}>
      <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading eyebrow="FAQ" title={<span id={`${id}-title`}>{title}</span>} description="Can't find what you need? Get in touch and we'll respond within one business day." />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {items.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.question}>
                <h3>
                  <button type="button" id={`${base}-b${i}`} aria-expanded={isOpen} aria-controls={`${base}-p${i}`} onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-4 py-5 text-left font-display text-base font-semibold text-ink hover:text-brand sm:text-lg">
                    {f.question}
                    <ChevronDown className={cn('h-5 w-5 shrink-0 transition-transform duration-300', isOpen && 'rotate-180 text-brand')} aria-hidden="true" />
                  </button>
                </h3>
                <div id={`${base}-p${i}`} role="region" aria-labelledby={`${base}-b${i}`} className={cn('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="overflow-hidden"><p className="pb-5 leading-relaxed text-slate-600">{f.answer}</p></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
