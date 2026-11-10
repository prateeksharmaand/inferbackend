import { Avatar } from './Avatar'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { SocialIcon } from './SocialIcons'
import { team } from '../data/team'

export function TeamSection() {
  return (
    <section id="team" className="section bg-slate-50" aria-labelledby="team-title">
      <div className="container-x">
        <SectionHeading eyebrow="Leadership" title={<span id="team-title">The people behind the products</span>} description="Placeholder names — replace in data/team.ts." />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {team.map((m, i) => (
            <Reveal as="li" key={m.name} delay={i * 0.06} className="card card-hover overflow-hidden">
              <div className="aspect-square"><Avatar name={m.name} square /></div>
              <div className="flex items-start justify-between gap-2 p-4">
                <div>
                  <h3 className="text-base font-semibold">{m.name}</h3>
                  <p className="text-sm text-slate-500">{m.role}</p>
                </div>
                <a href={m.linkedin} target="_blank" rel="noreferrer" aria-label={`${m.name} on LinkedIn`} className="mt-0.5 text-slate-400 hover:text-brand"><SocialIcon id="linkedin" className="h-5 w-5" /></a>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
