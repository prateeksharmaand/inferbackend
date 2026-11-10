import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'light'

const styles: Record<Variant, string> = {
  primary: 'btn-shine bg-brand text-white shadow-lg shadow-brand/25 hover:bg-indigo-500',
  secondary: 'border border-slate-300 bg-white text-ink hover:border-brand hover:text-brand',
  ghost: 'border border-white/25 text-white hover:bg-white/10',
  light: 'bg-white text-ink hover:bg-slate-100',
}

interface Props {
  children: ReactNode
  to?: string
  href?: string
  variant?: Variant
  arrow?: boolean
  className?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
}

export function Button({ children, to, href, variant = 'primary', arrow, className, type = 'button', onClick, disabled }: Props) {
  const cls = cn(
    'group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition duration-200 disabled:opacity-60 max-sm:w-full',
    styles[variant],
    className,
  )
  const inner = (
    <>
      {children}
      {arrow && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
    </>
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (href) return <a href={href} className={cls}>{inner}</a>
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{inner}</button>
}
