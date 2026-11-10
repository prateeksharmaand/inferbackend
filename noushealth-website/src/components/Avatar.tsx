const hues = [245, 200, 265, 190, 225, 280]

/** Generated initials avatar — swap for a real <img> when photos are available. */
export function Avatar({ name, size = 56, square = false }: { name: string; size?: number; square?: boolean }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('')
  const h = hues[name.length % hues.length]
  return (
    <span
      role="img"
      aria-label={`Portrait placeholder of ${name}`}
      className={`grid shrink-0 place-items-center font-display font-bold text-white ${square ? 'h-full w-full' : 'rounded-full'}`}
      style={{ width: square ? undefined : size, height: square ? undefined : size, background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${h + 40} 80% 55%))`, fontSize: square ? '3rem' : size / 2.6 }}
    >
      {initials}
    </span>
  )
}
