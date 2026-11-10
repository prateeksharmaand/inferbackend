import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Art } from './Art'
import { Icon } from '../lib/icons'
import type { Industry } from '../data/types'

export function IndustryCard({ industry }: { industry: Industry }) {
  return (
    <Link
      id={industry.slug}
      to={`/case-studies?industry=${encodeURIComponent(industry.title)}`}
      className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-ink focus-visible:outline-offset-2 sm:aspect-[5/4]"
    >
      <div className="absolute inset-0 transition duration-500 group-hover:scale-105 group-focus-visible:scale-105"><Art image={industry.image} /></div>
      <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent transition-opacity group-hover:from-ink group-hover:via-ink/80" />
      <div className="absolute inset-0 flex flex-col justify-end p-5 text-white">
        <Icon name={industry.icon} className="mb-3 h-6 w-6 text-accent" />
        <h3 className="font-display text-xl font-semibold !text-white">{industry.title}</h3>
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr] max-md:grid-rows-[1fr]">
          <div className="overflow-hidden">
            <p className="mt-2 text-sm text-slate-200">{industry.description}</p>
            <p className="mt-2 text-xs text-accent">{industry.services.join(' · ')}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium">View work <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
          </div>
        </div>
      </div>
    </Link>
  )
}
