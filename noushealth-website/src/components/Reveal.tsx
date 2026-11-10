import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  as?: 'div' | 'li' | 'article'
}

export function Reveal({ children, delay = 0, y = 24, className, as = 'div' }: Props) {
  const reduce = useReducedMotion()
  const M = motion[as]
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </M>
  )
}
