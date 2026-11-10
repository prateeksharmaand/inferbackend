import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Art } from './Art'
import type { CaseStudy } from '../data/types'
import { cn } from '../lib/utils'

export function CaseStudyCard({ study, featured }: { study: CaseStudy; featured?: boolean }) {
  return (
    <Link to={`/case-studies/${study.slug}`} className={cn('card card-hover group flex overflow-hidden', featured ? 'flex-col lg:grid lg:grid-cols-2' : 'h-full flex-col')}>
      <div className={cn('relative overflow-hidden bg-ink', featured ? 'aspect-[5/3] lg:self-center' : 'aspect-[5/3]')}>
        <div className="h-full w-full transition duration-500 group-hover:scale-105"><Art image={study.image} /></div>
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink backdrop-blur">{study.industry}</span>
      </div>
      <div className={cn('flex flex-1 flex-col', featured ? 'p-6 sm:p-10' : 'p-6')}>
        {featured && <p className="eyebrow mb-3">Featured case study</p>}
        <h3 className={cn('font-semibold', featured ? 'text-2xl sm:text-3xl' : 'text-xl')}>{study.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{study.summary}</p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Technologies">
          {study.technologies.slice(0, featured ? 6 : 4).map((t) => (
            <li key={t} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{t}</li>
          ))}
        </ul>
        <p className="mt-5 rounded-lg bg-brand/5 px-3 py-2 text-sm font-semibold text-brand">{study.outcome}</p>
        {featured && (
          <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-200 pt-6">
            {study.metrics.map((m) => (
              <div key={m.label}><dd className="font-display text-xl font-bold text-ink sm:text-2xl">{m.value}</dd><dt className="text-xs text-slate-500">{m.label}</dt></div>
            ))}
          </dl>
        )}
        <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-brand">View Case Study <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
      </div>
    </Link>
  )
}
