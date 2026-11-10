import { Reveal } from '../Reveal'
import { clients } from '../../data/site'

export function ClientLogos() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-14 pr-14" aria-hidden={hidden || undefined}>
      {clients.map((c) => (
        <li key={c} className="flex items-center gap-2 text-slate-400 grayscale transition duration-300 hover:text-brand hover:grayscale-0">
          <span className="h-5 w-5 rounded-md bg-current opacity-60" aria-hidden="true" />
          <span className="whitespace-nowrap font-display text-xl font-bold tracking-tight">{c}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <section className="border-b border-slate-200 bg-white py-14" aria-labelledby="clients-title">
      <div className="container-x">
        <Reveal><h2 id="clients-title" className="text-center font-sans text-sm font-medium text-slate-500">Trusted by teams building what&apos;s next</h2></Reveal>
      </div>
      <div className="marquee mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="animate-marquee flex w-max">{row(false)}{row(true)}</div>
      </div>
    </section>
  )
}
