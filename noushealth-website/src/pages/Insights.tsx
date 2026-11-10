import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, Search } from 'lucide-react'
import { PageHero } from '../components/PageHero'
import { Art } from '../components/Art'
import { Reveal } from '../components/Reveal'
import { CTASection } from '../components/CTASection'
import { articleCategories, articles } from '../data/articles'
import { formatDate, cn } from '../lib/utils'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'
import type { Article } from '../data/types'

const allTags = [...new Set(articles.flatMap((a) => a.tags))].sort()

function Meta({ a }: { a: Article }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span>{a.author.name}</span><span aria-hidden="true">·</span>
      <time dateTime={a.date}>{formatDate(a.date)}</time><span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{a.readingTime} min read</span>
    </p>
  )
}

export default function Insights() {
  useSeo(pageSeo.insights)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const cat = params.get('category') ?? ''
  const tag = params.get('tag') ?? ''
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v && next.get(k) !== v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
  }

  const list = useMemo(() => articles.filter((a) =>
    (!cat || a.category === cat) && (!tag || a.tags.includes(tag)) &&
    (!q || `${a.title} ${a.excerpt}`.toLowerCase().includes(q.toLowerCase())),
  ), [q, cat, tag])
  const filtering = Boolean(q || cat || tag)
  const featured = !filtering ? articles.find((a) => a.featured) : undefined
  const rest = list.filter((a) => a !== featured)

  return (
    <>
      <PageHero eyebrow="Insights" title="Engineering perspectives and practical guides" crumbs={[{ label: 'Insights' }]} />
      <section className="section !pt-12">
        <div className="container-x">
          <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
            <div>
              {featured && (
                <Reveal className="mb-8">
                  <Link to={`/insights/${featured.slug}`} className="card card-hover group grid overflow-hidden md:grid-cols-2">
                    <div className="aspect-[16/10] overflow-hidden md:aspect-auto"><div className="h-full transition duration-500 group-hover:scale-105"><Art image={featured.image} /></div></div>
                    <div className="p-6 sm:p-8">
                      <p className="eyebrow mb-3">Featured · {featured.category}</p>
                      <h2 className="text-2xl font-bold">{featured.title}</h2>
                      <p className="mt-3 text-slate-600">{featured.excerpt}</p>
                      <div className="mt-5"><Meta a={featured} /></div>
                    </div>
                  </Link>
                </Reveal>
              )}
              <p className="mb-4 text-sm text-slate-500" role="status">{list.length} article{list.length === 1 ? '' : 's'}</p>
              {rest.length ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  {rest.map((a, i) => (
                    <Reveal key={a.slug} delay={(i % 2) * 0.06}>
                      <Link to={`/insights/${a.slug}`} className="card card-hover group flex h-full flex-col overflow-hidden">
                        <div className="aspect-[16/9] overflow-hidden"><div className="h-full transition duration-500 group-hover:scale-105"><Art image={a.image} /></div></div>
                        <div className="flex flex-1 flex-col p-5">
                          <p className="font-mono text-xs uppercase tracking-wider text-brand">{a.category}</p>
                          <h3 className="mt-2 text-lg font-semibold group-hover:text-brand">{a.title}</h3>
                          <p className="mt-2 flex-1 text-sm text-slate-600">{a.excerpt}</p>
                          <div className="mt-4"><Meta a={a} /></div>
                        </div>
                      </Link>
                    </Reveal>
                  ))}
                </div>
              ) : !featured && <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center">No articles match. <button className="font-medium text-brand" onClick={() => setParams({}, { replace: true })}>Clear filters</button></p>}
            </div>

            <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start" aria-label="Filters">
              <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
                <label htmlFor="a-search" className="sr-only">Search articles</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="a-search" type="search" value={q} onChange={(e) => set('q', e.target.value === '' ? '' : e.target.value)} placeholder="Search articles…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand" />
              </form>
              <div>
                <h2 className="mb-3 font-sans text-sm font-semibold">Categories</h2>
                <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
                  {articleCategories.map((c) => (
                    <li key={c}><button aria-pressed={cat === c} onClick={() => set('category', c)} className={cn('rounded-full border px-3 py-1.5 text-sm transition lg:w-full lg:rounded-md lg:border-0 lg:text-left', cat === c ? 'border-brand bg-brand text-white' : 'border-slate-200 hover:border-brand hover:text-brand lg:hover:bg-slate-50')}>{c}</button></li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="mb-3 font-sans text-sm font-semibold">Tags</h2>
                <ul className="flex flex-wrap gap-2">{allTags.map((t) => <li key={t}><button aria-pressed={tag === t} onClick={() => set('tag', t)} className={cn('rounded-md px-2 py-1 font-mono text-xs', tag === t ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>#{t}</button></li>)}</ul>
              </div>
            </aside>
          </div>
        </div>
      </section>
      <CTASection />
    </>
  )
}
