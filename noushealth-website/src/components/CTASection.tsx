import { Button } from './Button'
import { Reveal } from './Reveal'

interface Props { title?: string; text?: string }

export function CTASection({ title = 'Have a Digital Product in Mind?', text = "Let's turn your idea into a scalable, high-performance digital product." }: Props) {
  return (
    <section className="px-5 pb-20 sm:px-8 sm:pb-28" aria-labelledby="cta-title">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-ink px-6 py-16 text-center sm:px-16 sm:py-24">
        <div className="grid-bg absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="animate-drift absolute -left-20 top-0 h-72 w-72 rounded-full bg-brand/50 blur-3xl" aria-hidden="true" />
        <div className="animate-drift absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-sky/30 blur-3xl [animation-direction:alternate-reverse]" aria-hidden="true" />
        <div className="relative">
          <h2 id="cta-title" className="mx-auto max-w-3xl text-3xl font-bold !text-white sm:text-5xl">{title}</h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-300 sm:text-lg">{text}</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button to="/contact" variant="light" arrow>Start a Conversation</Button>
            <Button to="/contact?type=call" variant="ghost">Schedule a Call</Button>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
