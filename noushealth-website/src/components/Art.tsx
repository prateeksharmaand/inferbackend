import { useId, useState } from 'react'
import type { ImageAsset } from '../config/images'

const palettes = [
  ['#4f46e5', '#0ea5e9'], ['#312e81', '#22d3ee'], ['#1e1b4b', '#6366f1'], ['#0f172a', '#4f46e5'], ['#0c4a6e', '#22d3ee'], ['#3730a3', '#38bdf8'],
]

const rng = (seed: number) => {
  let s = seed * 9301 + 49297
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

/** Generated, on-brand illustration used wherever a real image has not been supplied. */
export function Art({ image, className = '' }: { image: ImageAsset; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (image.src && !failed) {
    const sep = image.src.includes('?') ? '&' : '?'
    const at = (w: number) => `${image.src}${sep}w=${w}`
    return (
      <img
        src={at(800)}
        srcSet={`${at(480)} 480w, ${at(800)} 800w, ${at(1200)} 1200w, ${at(1600)} 1600w`}
        sizes="(min-width: 1280px) 1200px, 100vw"
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    )
  }
  const [c1, c2] = palettes[image.seed % palettes.length]
  const r = rng(image.seed)
  const pts = Array.from({ length: 14 }, () => ({ x: 40 + r() * 520, y: 30 + r() * 340, s: 3 + r() * 5 }))
  const bars = Array.from({ length: 9 }, () => 40 + r() * 160)

  let shapes: React.ReactNode
  switch (image.kind) {
    case 'data':
      shapes = (
        <g>
          {bars.map((h, i) => (
            <rect key={i} x={70 + i * 55} y={330 - h} width="30" height={h} rx="4" fill="#fff" opacity={0.16 + (i % 3) * 0.08} />
          ))}
          <polyline points={bars.map((h, i) => `${85 + i * 55},${320 - h - 20}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinejoin="round" />
        </g>
      )
      break
    case 'mobile':
      shapes = (
        <g>
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${190 + i * 120} ${50 + i * 25}) rotate(${i ? 6 : -6})`}>
              <rect width="130" height="270" rx="22" fill="#0b1020" opacity=".7" stroke="#fff" strokeOpacity=".4" />
              <rect x="14" y="30" width="102" height="44" rx="8" fill="#fff" opacity=".18" />
              <rect x="14" y="86" width="60" height="8" rx="4" fill="#fff" opacity=".4" />
              <rect x="14" y="104" width="102" height="60" rx="8" fill="#22d3ee" opacity=".3" />
              <rect x="14" y="176" width="102" height="30" rx="8" fill="#fff" opacity=".14" />
            </g>
          ))}
        </g>
      )
      break
    case 'web':
    case 'enterprise':
      shapes = (
        <g transform="translate(90 60)">
          <rect width="420" height="280" rx="14" fill="#0b1020" opacity=".62" stroke="#fff" strokeOpacity=".35" />
          <rect width="420" height="30" rx="14" fill="#fff" opacity=".12" />
          {[0, 1, 2].map((i) => <circle key={i} cx={18 + i * 16} cy="15" r="4" fill="#fff" opacity=".5" />)}
          <rect x="20" y="52" width="120" height="208" rx="8" fill="#fff" opacity=".1" />
          <rect x="156" y="52" width="244" height="70" rx="8" fill="#22d3ee" opacity=".25" />
          <rect x="156" y="136" width="116" height="124" rx="8" fill="#fff" opacity=".14" />
          <rect x="284" y="136" width="116" height="124" rx="8" fill="#fff" opacity=".1" />
        </g>
      )
      break
    case 'code':
      shapes = (
        <g transform="translate(80 70)" fontFamily="monospace">
          <rect width="440" height="260" rx="14" fill="#0b1020" opacity=".7" stroke="#fff" strokeOpacity=".3" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x={24 + (i % 3) * 22} y={30 + i * 30} width={90 + ((i * 53) % 180)} height="8" rx="4" fill={i % 2 ? '#22d3ee' : '#a5b4fc'} opacity=".7" />
          ))}
        </g>
      )
      break
    case 'cloud':
      shapes = (
        <g>
          <path d="M170 240a50 50 0 0 1 8-99 70 70 0 0 1 134-12 55 55 0 0 1 22 111z" fill="#fff" opacity=".2" stroke="#fff" strokeOpacity=".6" strokeWidth="2" transform="translate(70 0)" />
          {[0, 1, 2].map((i) => <rect key={i} x={170 + i * 90} y="290" width="60" height="50" rx="8" fill="#0b1020" opacity=".55" stroke="#22d3ee" strokeOpacity=".7" />)}
        </g>
      )
      break
    case 'team':
    case 'office':
      shapes = (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${110 + i * 105} ${i % 2 ? 150 : 120})`}>
              <circle cx="40" cy="30" r="28" fill="#fff" opacity=".28" />
              <path d="M0 150c0-50 20-80 40-80s40 30 40 80z" fill="#fff" opacity=".2" />
            </g>
          ))}
        </g>
      )
      break
    default:
      shapes = (
        <g>
          {pts.map((p, i) => i > 0 && <line key={`l${i}`} x1={pts[i - 1].x} y1={pts[i - 1].y} x2={p.x} y2={p.y} stroke="#fff" strokeOpacity=".3" />)}
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.s} fill={i % 3 ? '#fff' : '#22d3ee'} opacity=".8" />)}
        </g>
      )
  }

  return (
    <svg viewBox="0 0 600 400" role={image.alt ? 'img' : 'presentation'} aria-label={image.alt || undefined} aria-hidden={image.alt ? undefined : true} preserveAspectRatio="xMidYMid slice" className={`h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <pattern id={`p${id}`} width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="#fff" strokeOpacity=".07" />
        </pattern>
      </defs>
      <rect width="600" height="400" fill={`url(#g${id})`} />
      <rect width="600" height="400" fill={`url(#p${id})`} />
      <circle cx={520 - (image.seed % 5) * 60} cy="60" r="110" fill="#fff" opacity=".07" />
      {shapes}
    </svg>
  )
}
