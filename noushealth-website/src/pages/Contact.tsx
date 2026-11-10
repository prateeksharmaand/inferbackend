import { useState, type FormEvent } from 'react'
import { CheckCircle2, Mail, MapPin, Phone } from 'lucide-react'
import { PageHero } from '../components/PageHero'
import { SocialIcon } from '../components/SocialIcons'
import { Button } from '../components/Button'
import { company } from '../config/company'
import { services } from '../data/services'
import { budgets } from '../data/site'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

type Values = { name: string; company: string; email: string; phone: string; service: string; budget: string; message: string }
type Errors = Partial<Record<keyof Values, string>>
const empty: Values = { name: '', company: '', email: '', phone: '', service: '', budget: '', message: '' }

const validate = (v: Values): Errors => {
  const e: Errors = {}
  if (v.name.trim().length < 2) e.name = 'Please enter your full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email address.'
  if (v.phone && !/^[+\d][\d\s()-]{6,}$/.test(v.phone)) e.phone = 'Enter a valid phone number.'
  if (!v.service) e.service = 'Select a service.'
  if (v.message.trim().length < 20) e.message = 'Tell us a little more (at least 20 characters).'
  return e
}

export default function Contact() {
  useSeo(pageSeo.contact)
  const [values, setValues] = useState<Values>(empty)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  const change = (k: keyof Values, val: string) => {
    setValues((p) => ({ ...p, [k]: val }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate(values)
    setErrors(e)
    if (Object.keys(e).length) {
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus()
      return
    }
    setStatus('sending')
    setTimeout(() => setStatus('sent'), 1200) // simulated — no backend
  }

  const input = (k: keyof Values) => `mt-1.5 w-full rounded-lg border bg-white px-3.5 py-3 text-sm text-ink focus:border-brand ${errors[k] ? 'border-red-500' : 'border-slate-300'}`
  const field = (k: keyof Values, label: string, required = false) => (
    <label htmlFor={`f-${k}`} className="block text-sm font-medium text-ink">
      {label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}
    </label>
  )
  const err = (k: keyof Values) => errors[k] && <p id={`e-${k}`} role="alert" className="mt-1 text-xs text-red-600">{errors[k]}</p>
  const aria = (k: keyof Values) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `e-${k}` : undefined })

  return (
    <>
      <PageHero eyebrow="Contact" title="Let's talk about your project" description="Tell us what you're building and we'll respond within one business day." crumbs={[{ label: 'Contact' }]} />
      <section className="section !pt-12">
        <div className="container-x grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="card p-6 sm:p-10">
            {status === 'sent' ? (
              <div className="py-10 text-center" role="status">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" aria-hidden="true" />
                <h2 className="mt-5 text-2xl font-bold">Thanks, {values.name.split(' ')[0]} — inquiry received</h2>
                <p className="mx-auto mt-3 max-w-md">A senior member of our team will review your project and reply to <strong>{values.email}</strong> within one business day.</p>
                <p className="mt-2 text-xs text-slate-400">(Demo only: this form does not send data.)</p>
                <div className="mt-8"><Button variant="secondary" onClick={() => { setValues(empty); setStatus('idle') }}>Send another inquiry</Button></div>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2 className="text-2xl font-bold">Project inquiry</h2>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>{field('name', 'Full Name', true)}<input id="f-name" autoComplete="name" value={values.name} onChange={(e) => change('name', e.target.value)} className={input('name')} {...aria('name')} />{err('name')}</div>
                  <div>{field('company', 'Company')}<input id="f-company" autoComplete="organization" value={values.company} onChange={(e) => change('company', e.target.value)} className={input('company')} /></div>
                  <div>{field('email', 'Email', true)}<input id="f-email" type="email" autoComplete="email" value={values.email} onChange={(e) => change('email', e.target.value)} className={input('email')} {...aria('email')} />{err('email')}</div>
                  <div>{field('phone', 'Phone')}<input id="f-phone" type="tel" autoComplete="tel" value={values.phone} onChange={(e) => change('phone', e.target.value)} className={input('phone')} {...aria('phone')} />{err('phone')}</div>
                  <div>{field('service', 'Service', true)}
                    <select id="f-service" value={values.service} onChange={(e) => change('service', e.target.value)} className={input('service')} {...aria('service')}>
                      <option value="">Select a service</option>{services.map((s) => <option key={s.slug}>{s.title}</option>)}
                    </select>{err('service')}</div>
                  <div>{field('budget', 'Project Budget')}
                    <select id="f-budget" value={values.budget} onChange={(e) => change('budget', e.target.value)} className={input('budget')}>
                      <option value="">Select a range</option>{budgets.map((b) => <option key={b}>{b}</option>)}
                    </select></div>
                  <div className="sm:col-span-2">{field('message', 'Message', true)}<textarea id="f-message" rows={5} value={values.message} onChange={(e) => change('message', e.target.value)} className={input('message')} {...aria('message')} />{err('message')}</div>
                </div>
                <div className="mt-6"><Button type="submit" disabled={status === 'sending'} arrow>{status === 'sending' ? 'Sending…' : 'Send Inquiry'}</Button></div>
              </form>
            )}
          </div>

          <aside className="space-y-6" aria-label="Contact information">
            <div className="card p-6">
              <h2 className="text-xl font-bold">Contact information</h2>
              <ul className="mt-5 space-y-4 text-sm">
                <li className="flex gap-3"><Mail className="h-5 w-5 text-brand" aria-hidden="true" /><div><p className="text-slate-500">Email</p><a className="font-medium text-ink hover:text-brand" href={`mailto:${company.email}`}>{company.email}</a></div></li>
                <li className="flex gap-3"><Phone className="h-5 w-5 text-brand" aria-hidden="true" /><div><p className="text-slate-500">Phone</p><a className="font-medium text-ink hover:text-brand" href={`tel:${company.phone.replace(/\s/g, '')}`}>{company.phone}</a></div></li>
                <li className="flex gap-3"><MapPin className="h-5 w-5 text-brand" aria-hidden="true" /><div><p className="text-slate-500">Office</p><p className="font-medium text-ink">{company.address}</p></div></li>
              </ul>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Button href={`mailto:${company.email}`} variant="secondary" className="!py-2.5 flex-1">Email us</Button>
                <Button href={`tel:${company.phone.replace(/\s/g, '')}`} variant="secondary" className="!py-2.5 flex-1">Call us</Button>
              </div>
              <ul className="mt-6 flex gap-2 border-t border-slate-200 pt-5">
                {company.socialLinks.map((s) => <li key={s.id}><a href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-brand hover:text-brand"><SocialIcon id={s.id} /></a></li>)}
              </ul>
            </div>
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100" role="img" aria-label={`Map placeholder for ${company.address}`}>
              <div className="grid-bg absolute inset-0" aria-hidden="true" />
              <div className="relative text-center"><MapPin className="mx-auto h-9 w-9 text-brand" aria-hidden="true" /><p className="mt-2 text-sm font-medium text-ink">{company.address}</p><p className="text-xs text-slate-500">Google Maps embed placeholder</p></div>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
