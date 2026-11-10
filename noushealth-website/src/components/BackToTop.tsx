import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700)
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed bottom-5 right-5 z-40 grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-lg transition duration-300 hover:bg-indigo-500 ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
      tabIndex={show ? 0 : -1}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}
