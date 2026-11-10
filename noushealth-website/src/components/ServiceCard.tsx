import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Icon } from '../lib/icons'
import type { Service } from '../data/types'

export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link to={`/services/${service.slug}`} className="card card-hover group flex h-full flex-col p-6">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
        <Icon name={service.icon} />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{service.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{service.short}</p>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand">
        Learn more <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  )
}
