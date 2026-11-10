import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock } from 'lucide-react'
import { PageHero } from '../components/PageHero'
import { Art } from '../components/Art'
import { ImageReveal } from '../components/ImageReveal'
import { Avatar } from '../components/Avatar'
import { CTASection } from '../components/CTASection'
import { articles, getArticle } from '../data/articles'
import { formatDate } from '../lib/utils'
import { useSeo } from '../hooks/useSeo'

export default function ArticleDetail() {
  const { slug = '' } = useParams()
  const a = getArticle(slug)
  useSeo({ title: `${a?.title ?? 'Article'} — Nous Healthcare Insights`, description: a?.excerpt ?? '', path: `/insights/${slug}`, type: 'article' })
  if (!a) return <Navigate to="/404" replace />
  const more = articles.filter((x) => x.slug !== slug && x.category === a.category).concat(articles.filter((x) => x.slug !== slug && x.category !== a.category)).slice(0, 3)

  return (
    <>
      <PageHero eyebrow={a.category} title={a.title} crumbs={[{ label: 'Insights', to: '/insights' }, { label: a.category }]} />
      <article className="container-x max-w-3xl py-12 sm:py-16">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-6">
          <Avatar name={a.author.name} size={44} />
          <div className="text-sm"><p className="font-semibold text-ink">{a.author.name}</p><p className="text-slate-500">{a.author.role}</p></div>
          <p className="ml-auto flex items-center gap-1 text-xs text-slate-500"><time dateTime={a.date}>{formatDate(a.date)}</time> · <Clock className="h-3 w-3" aria-hidden="true" /> {a.readingTime} min</p>
        </div>
        <ImageReveal className="my-8 aspect-[16/9] overflow-hidden rounded-xl"><Art image={a.image} /></ImageReveal>
        <p className="text-lg font-medium leading-relaxed text-ink">{a.excerpt}</p>
        {a.body.map((s) => (
          <section key={s.heading} className="mt-8">
            {s.heading && <h2 className="text-2xl font-bold">{s.heading}</h2>}
            {s.paragraphs.map((p) => <p key={p} className="mt-4 leading-[1.8]">{p}</p>)}
          </section>
        ))}
        <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">{a.tags.map((t) => <li key={t}><Link to={`/insights?tag=${encodeURIComponent(t)}`} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs hover:bg-slate-200">#{t}</Link></li>)}</ul>
        <Link to="/insights" className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-brand"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All articles</Link>
      </article>
      <section className="bg-slate-50 py-16" aria-label="Related articles"><div className="container-x"><h2 className="mb-8 text-2xl font-bold">Keep reading</h2>
        <div className="grid gap-5 md:grid-cols-3">{more.map((m) => <Link key={m.slug} to={`/insights/${m.slug}`} className="card card-hover block p-5"><p className="font-mono text-xs uppercase text-brand">{m.category}</p><h3 className="mt-2 text-lg font-semibold">{m.title}</h3><p className="mt-1 text-sm text-slate-500">{m.readingTime} min read</p></Link>)}</div></div></section>
      <CTASection />
    </>
  )
}
