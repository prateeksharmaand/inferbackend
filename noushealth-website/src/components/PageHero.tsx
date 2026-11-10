import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

interface Props {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  crumbs?: { label: string; to?: string }[]
  children?: ReactNode
}

export function PageHero({ eyebrow, title, description, crumbs, children }: Props) {
  return (
    <section className="relative overflow-hidden bg-ink pb-16 pt-32 sm:pb-20 sm:pt-40">
      <div className="grid-bg absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="animate-drift absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
      <div className="container-x relative">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
              <li><Link to="/" className="hover:text-white">Home</Link></li>
              {crumbs.map((c) => (
                <li key={c.label} className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  {c.to ? <Link to={c.to} className="hover:text-white">{c.label}</Link> : <span aria-current="page" className="text-slate-200">{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {eyebrow && <p className="eyebrow mb-4 !text-accent">{eyebrow}</p>}
        <h1 className="max-w-4xl text-4xl font-bold leading-[1.1] !text-white sm:text-5xl lg:text-6xl">{title}</h1>
        {description && <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">{description}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  )
}
