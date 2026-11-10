import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { Logo } from './Logo'
import { SocialIcon } from './SocialIcons'
import { company } from '../config/company'
import { footerColumns } from '../config/navigation'

export function Footer() {
  return (
    <footer className="bg-ink text-slate-400" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="container-x py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)_1.4fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">{company.tagline}</p>
            <ul className="mt-6 flex gap-2">
              {company.socialLinks.map((s) => (
                <li key={s.id}>
                  <a href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-accent hover:text-accent">
                    <SocialIcon id={s.id} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:col-span-2 sm:grid-cols-4 lg:col-span-4 lg:contents">
            {footerColumns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h3 className="mb-4 text-sm font-semibold text-white">{col.title}</h3>
                <ul className="space-y-2.5 text-sm">
                  {col.links.map((l) => (
                    <li key={l.label}><Link to={l.to} className="transition hover:text-white">{l.label}</Link></li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><a href={`mailto:${company.email}`} className="break-all hover:text-white">{company.email}</a></li>
              <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><a href={`tel:${company.phone.replace(/\s/g, '')}`} className="hover:text-white">{company.phone}</a></li>
              <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{company.address}</span></li>
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 {company.companyName}. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((t) => (
              <li key={t}><Link to="/contact" className="hover:text-white">{t}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
