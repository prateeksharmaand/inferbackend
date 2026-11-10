import { useEffect, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { Brain, Cloud, Code2, ShieldCheck, Smartphone } from 'lucide-react'

const nodes = [
  { x: 60, y: 70, i: Brain }, { x: 330, y: 40, i: Cloud }, { x: 370, y: 140, i: Smartphone }, { x: 40, y: 270, i: ShieldCheck },
]
const line = "scale(idea, 'production')"

function useTyping(text: string, enabled: boolean) {
  const [n, setN] = useState(enabled ? 0 : text.length)
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setN((v) => (v >= text.length + 14 ? 0 : v + 1)), 120)
    return () => clearInterval(t)
  }, [text, enabled])
  return text.slice(0, Math.min(n, text.length))
}

/** Decorative network + floating panels with gentle mouse parallax. */
export function HeroVisual() {
  const reduce = useReducedMotion()
  const typed = useTyping(line, !reduce)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 80, damping: 20 })
  const sy = useSpring(my, { stiffness: 80, damping: 20 })
  const x1 = useTransform(sx, (v) => v * 14)
  const y1 = useTransform(sy, (v) => v * 14)
  const x2 = useTransform(sx, (v) => v * -20)
  const y2 = useTransform(sy, (v) => v * -20)

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[520px]"
      aria-hidden="true"
      onMouseMove={(e) => {
        if (reduce) return
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width - 0.5)
        my.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onMouseLeave={() => { mx.set(0); my.set(0) }}
    >
      <svg viewBox="0 0 420 340" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#4f46e5" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="210" cy="170" r="110" fill="url(#core)" opacity=".5" />
        {[60, 100, 140].map((r) => <circle key={r} cx="210" cy="170" r={r} fill="none" stroke="#fff" strokeOpacity=".08" strokeDasharray="3 6" />)}
        <g className="animate-spin-slow" style={{ transformOrigin: '210px 170px' }}>
          <circle cx="210" cy="170" r="100" fill="none" stroke="#22d3ee" strokeOpacity=".25" />
          <circle cx="310" cy="170" r="4" fill="#22d3ee" />
          <circle cx="110" cy="170" r="3" fill="#a5b4fc" />
        </g>
        {nodes.map((n) => (
          <line key={n.x} x1="210" y1="170" x2={n.x + 22} y2={n.y + 22} stroke="#22d3ee" strokeOpacity=".5" strokeDasharray="4 6" className="animate-dash" />
        ))}
        <circle cx="210" cy="170" r="10" fill="#22d3ee" /><circle cx="210" cy="170" r="10" fill="#22d3ee" className="animate-ring" />
      </svg>
      {nodes.map((n, idx) => (
        <div key={idx} className={`absolute grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-accent backdrop-blur ${idx % 2 ? 'animate-float-slow' : 'animate-float'}`} style={{ left: `${(n.x / 420) * 100}%`, top: `${(n.y / 340) * 100}%` }}>
          <n.i className="h-5 w-5" />
        </div>
      ))}
      <motion.div style={{ x: x1, y: y1 }} className="absolute left-[8%] top-[40%] w-[46%]">
        <div className="animate-float rounded-xl border border-white/15 bg-ink-2/80 p-4 font-mono text-[11px] leading-relaxed text-slate-300 shadow-2xl backdrop-blur">
          <div className="mb-2 flex gap-1.5"><i className="h-2 w-2 rounded-full bg-red-400" /><i className="h-2 w-2 rounded-full bg-amber-400" /><i className="h-2 w-2 rounded-full bg-emerald-400" /></div>
          <p><span className="text-indigo-300">const</span> app = <span className="text-accent">{typed}</span><span className="animate-blink text-accent">▌</span></p>
          <p className="text-emerald-300">✓ deployed in 38s</p>
        </div>
      </motion.div>
      <motion.div style={{ x: x2, y: y2 }} className="absolute bottom-[10%] right-[6%] w-[42%]">
        <div className="animate-float-slow rounded-xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-slate-300"><Code2 className="h-4 w-4 text-accent" /> Deploy status</div>
          <div className="mt-3 flex h-10 items-end gap-1.5">
            {[40, 65, 50, 80, 70, 95].map((h, i) => (
              <motion.i key={i} className="w-full origin-bottom rounded-sm bg-gradient-to-t from-brand to-accent" style={{ height: `${h}%` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.8, delay: 0.8 + i * 0.1 }} />
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-emerald-300">● All systems operational</p>
        </div>
      </motion.div>
    </div>
  )
}
