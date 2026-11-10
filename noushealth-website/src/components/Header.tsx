import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import { ChevronDown, Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { Button } from './Button'
import { mainNav } from '../config/navigation'
import { services } from '../data/services'
import { cn } from '../lib/utils'

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [dropdown, setDropdown] = useState(false)
  const { pathname } = useLocation()
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
    setDropdown(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setOpen(false), setDropdown(false))
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const solid = scrolled && !open
  const linkCls = (active: boolean) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      solid ? (active ? 'text-brand' : 'text-slate-600 hover:text-ink') : active ? 'text-white' : 'text-slate-300 hover:text-white',
    )

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        solid ? 'border-b border-slate-200 bg-white/85 shadow-sm backdrop-blur-lg' : open ? 'bg-ink' : 'bg-transparent',
      )}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink">Skip to content</a>
      <div className="container-x flex h-16 items-center justify-between lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr]">
        <Logo light={!solid} />

        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {mainNav.map((item) =>
            item.label === 'Services' ? (
              <div key={item.to} className="relative" onMouseEnter={() => setDropdown(true)} onMouseLeave={() => setDropdown(false)}>
                <NavLink to={item.to} className={({ isActive }) => cn(linkCls(isActive), 'inline-flex items-center gap-1')} aria-haspopup="true" aria-expanded={dropdown} onFocus={() => setDropdown(true)}>
                  {item.label}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', dropdown && 'rotate-180')} aria-hidden="true" />
                </NavLink>
                <AnimatePresence>
                  {dropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-1/2 top-full w-[26rem] -translate-x-1/2 pt-3"
                    >
                      <ul className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                        {services.map((s) => (
                          <li key={s.slug}>
                            <Link to={`/services/${s.slug}`} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-brand">
                              {s.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => linkCls(isActive)}>
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="flex items-center justify-end gap-3">
          <div className="hidden lg:block">
            <Button to="/contact" className="!px-5 !py-2.5">Let&apos;s Talk</Button>
          </div>
          <button
            type="button"
            className={cn('grid h-10 w-10 place-items-center rounded-lg lg:hidden', solid ? 'text-ink' : 'text-white')}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      <motion.div aria-hidden="true" style={{ scaleX: progress }} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-brand to-accent" />
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label="Mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'calc(100dvh - 4rem)' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-y-auto bg-ink lg:hidden"
          >
            <ul className="container-x flex flex-col py-4">
              {mainNav.map((item, i) => (
                <motion.li key={item.to} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.03 }}>
                  <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => cn('block border-b border-white/10 py-4 font-display text-xl font-semibold', isActive ? 'text-accent' : 'text-white')}>
                    {item.label}
                  </NavLink>
                </motion.li>
              ))}
              <li className="pt-6"><Button to="/contact" className="w-full">Let&apos;s Talk</Button></li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
