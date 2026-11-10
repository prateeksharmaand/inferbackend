import type { ImageAsset } from '../config/images'

export type IconKey =
  | 'code' | 'globe' | 'smartphone' | 'brain' | 'cloud' | 'palette' | 'building' | 'compass'
  | 'heart' | 'landmark' | 'shopping' | 'graduation' | 'truck' | 'home' | 'factory' | 'layers' | 'plane' | 'briefcase'
  | 'users' | 'shield' | 'eye' | 'gauge' | 'handshake' | 'target' | 'database' | 'search' | 'rocket' | 'flask' | 'pen' | 'trending'

export interface FAQ { question: string; answer: string }

export interface Service {
  slug: string
  title: string
  short: string
  icon: IconKey
  headline: string
  overview: string
  capabilities: { title: string; description: string }[]
  technologies: string[]
  benefits: { title: string; description: string }[]
  relatedCaseStudies: string[]
  faqs: FAQ[]
}

export interface Industry {
  slug: string
  title: string
  icon: IconKey
  description: string
  services: string[]
  image: ImageAsset
}

export interface CaseStudy {
  slug: string
  title: string
  industry: string
  summary: string
  client: string
  technologies: string[]
  outcome: string
  metrics: { value: string; label: string }[]
  image: ImageAsset
  screenshots: ImageAsset[]
  featured?: boolean
  challenge: string
  solution: string
  architecture: string[]
  process: { phase: string; detail: string }[]
  results: string[]
}

export interface Testimonial { name: string; position: string; company: string; quote: string }
export interface TeamMember { name: string; role: string; bio: string; linkedin: string }
export interface TechCategory { name: string; items: string[] }

export interface Article {
  slug: string
  title: string
  excerpt: string
  category: string
  tags: string[]
  author: { name: string; role: string }
  date: string
  readingTime: number
  image: ImageAsset
  featured?: boolean
  body: { heading?: string; paragraphs: string[] }[]
}
