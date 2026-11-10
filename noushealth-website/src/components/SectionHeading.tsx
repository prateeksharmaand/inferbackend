import type { ReactNode } from 'react'
import { Reveal } from './Reveal'
import { cn } from '../lib/utils'

interface Props {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  dark?: boolean
  as?: 'h1' | 'h2'
  className?: string
}

export function SectionHeading({ eyebrow, title, description, align = 'left', dark, as: Tag = 'h2', className }: Props) {
  return (
    <Reveal className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <p className={cn('eyebrow mb-4', dark && 'text-accent')}>{eyebrow}</p>}
      <Tag className={cn('text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.75rem]', dark && 'text-white')}>{title}</Tag>
      {description && <p className={cn('mt-5 text-base leading-relaxed sm:text-lg', dark ? 'text-slate-300' : 'text-slate-600')}>{description}</p>}
    </Reveal>
  )
}
