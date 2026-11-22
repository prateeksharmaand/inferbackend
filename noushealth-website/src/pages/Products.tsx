import { ArrowUpRight, Check } from 'lucide-react'
import { CTASection } from '../components/CTASection'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { pageSeo } from '../config/seo'
import { products } from '../data/products'
import { useSeo } from '../hooks/useSeo'
import { Icon } from '../lib/icons'

export default function Products() {
  useSeo(pageSeo.products)
  return (
    <>
      <PageHero eyebrow="Products" title="AI products we build and run" description="Our own products, designed, engineered and operated by the Nous Healthcare team." crumbs={[{ label: 'Products' }]} />
      <section className="section">
        <div className="container-x space-y-20">
          {products.map((p, i) => (
            <Reveal key={p.slug} className="grid items-center gap-10 lg:grid-cols-2">
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name={p.icon} className="h-6 w-6" /></span>
                <p className="eyebrow mt-5">{p.audience}</p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{p.name}</h2>
                <p className="mt-2 text-lg font-medium text-slate-700">{p.tagline}</p>
                <p className="mt-4 text-slate-600">{p.description}</p>
                <ul className="mt-6 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-slate-700"><Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{f}</li>
                  ))}
                </ul>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="btn-shine mt-8 inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25 hover:bg-indigo-500">
                  Visit {p.urlLabel} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/10">
                <img src={p.image.src} alt={p.image.alt} loading="lazy" className="w-full" />
              </a>
            </Reveal>
          ))}
        </div>
      </section>
      <CTASection />
    </>
  )
}
