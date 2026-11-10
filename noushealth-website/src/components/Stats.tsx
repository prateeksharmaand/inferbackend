import { Counter } from './Counter'
import { stats } from '../data/site'

export function Stats() {
  return (
    <section className="relative overflow-hidden bg-ink py-16 sm:py-20" aria-label="Company statistics">
      <div className="grid-bg absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="container-x relative">
        <dl className="grid grid-cols-2 gap-y-10 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col-reverse px-4 text-center">
              <dd className="font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl"><Counter value={s.value} suffix={s.suffix} /></dd>
              <dt className="mt-2 text-sm text-slate-400 sm:text-base">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
