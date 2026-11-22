import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { products } from '../../data/products'
import { Icon } from '../../lib/icons'
import { Reveal } from '../Reveal'
import { SectionHeading } from '../SectionHeading'

export function ProductsSection() {
  return (
    <section className="section" id="products">
      <div className="container-x">
        <SectionHeading eyebrow="Our products" title="Products we build and run" description="Beyond client work, we ship and operate our own AI products." />
        <ul className="mt-12 grid gap-6 md:grid-cols-2">
          {products.map((p, i) => (
            <Reveal as="li" key={p.slug} delay={i * 0.08} className="card card-hover overflow-hidden">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={p.image.src} alt={p.image.alt} loading="lazy" className="aspect-[16/10] w-full border-b border-slate-200 object-cover object-top" />
              </a>
              <div className="p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name={p.icon} className="h-5 w-5" /></span>
                  <div>
                    <h3 className="text-xl font-semibold">{p.name}</h3>
                    <p className="text-sm text-slate-500">{p.tagline}</p>
                  </div>
                </div>
                <p className="mt-4 text-slate-600">{p.description}</p>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                  Visit {p.urlLabel} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </Reveal>
          ))}
        </ul>
        <div className="mt-8"><Link to="/products" className="font-semibold text-brand hover:underline">All products →</Link></div>
      </div>
    </section>
  )
}
