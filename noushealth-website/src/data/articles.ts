import { images } from '../config/images'
import type { Article } from './types'

export const articleCategories = ['AI', 'Software Development', 'Cloud', 'Mobile', 'Web', 'Cybersecurity', 'Digital Transformation']

const authors = {
  ananya: { name: 'Ananya Iyer', role: 'CTO' },
  marcus: { name: 'Marcus Chen', role: 'Head of Engineering' },
  kabir: { name: 'Kabir Singh', role: 'Design Lead' },
  leila: { name: 'Leila Haddad', role: 'Product Lead' },
}

const filler = (topic: string) => [
  {
    heading: 'Why it matters',
    paragraphs: [
      `${topic} is moving from experimentation to core business infrastructure. Teams that treat it as a product — with owners, metrics and a roadmap — consistently outperform those that treat it as a one-off project.`,
      'The common thread in successful programmes is a narrow first release, fast feedback and a willingness to retire what does not work.',
    ],
  },
  {
    heading: 'A practical approach',
    paragraphs: [
      'Start by identifying the single workflow where improvement would be most visible to customers or staff. Define a measurable baseline before writing code.',
      'Then deliver in small increments, instrumenting each release so decisions are driven by evidence rather than opinion.',
    ],
  },
  {
    heading: 'Key takeaways',
    paragraphs: ['Keep scope small, measure outcomes, invest in fundamentals like testing and observability, and revisit decisions regularly as you learn.'],
  },
]

/** Placeholder articles — replace with CMS/API data. */
export const articles: Article[] = [
  { slug: 'production-ready-llm-applications', title: 'What “production-ready” really means for LLM applications', excerpt: 'Evaluation, guardrails and observability: the unglamorous work that separates demos from dependable AI products.', category: 'AI', tags: ['LLM', 'Evaluation', 'Architecture'], author: authors.ananya, date: '2026-09-18', readingTime: 8, image: images.article(1, 'ai'), featured: true, body: filler('Applied AI') },
  { slug: 'modular-monolith-vs-microservices', title: 'Modular monolith or microservices? A decision framework', excerpt: 'How to choose an architecture based on team size, domain boundaries and operational maturity.', category: 'Software Development', tags: ['Architecture', 'Microservices'], author: authors.marcus, date: '2026-09-02', readingTime: 7, image: images.article(2, 'code'), body: filler('Architecture') },
  { slug: 'cloud-cost-optimisation', title: 'Seven habits that keep cloud bills under control', excerpt: 'Right-sizing, tagging and budgets — practical FinOps habits any team can adopt this quarter.', category: 'Cloud', tags: ['FinOps', 'AWS', 'Azure'], author: authors.ananya, date: '2026-08-21', readingTime: 6, image: images.article(3, 'cloud'), body: filler('Cloud cost management') },
  { slug: 'flutter-vs-native', title: 'Flutter or native in 2026? What we recommend', excerpt: 'Where cross-platform wins, where it does not, and how to decide for your product.', category: 'Mobile', tags: ['Flutter', 'iOS', 'Android'], author: authors.marcus, date: '2026-08-10', readingTime: 6, image: images.article(4, 'mobile'), body: filler('Mobile development') },
  { slug: 'core-web-vitals-checklist', title: 'A Core Web Vitals checklist for React teams', excerpt: 'Concrete steps to improve LCP, INP and CLS without rewriting your app.', category: 'Web', tags: ['Performance', 'React', 'SEO'], author: authors.kabir, date: '2026-07-29', readingTime: 5, image: images.article(5, 'web'), body: filler('Web performance') },
  { slug: 'secure-by-default', title: 'Building secure by default: a developer’s guide', excerpt: 'Threat modelling, dependency hygiene and secrets management that fit inside normal delivery workflows.', category: 'Cybersecurity', tags: ['Security', 'DevSecOps'], author: authors.marcus, date: '2026-07-15', readingTime: 9, image: images.article(6, 'enterprise'), body: filler('Application security') },
  { slug: 'digital-transformation-roadmap', title: 'A pragmatic roadmap for digital transformation', excerpt: 'Why transformation succeeds when it starts with one workflow and a clear owner.', category: 'Digital Transformation', tags: ['Strategy', 'Change'], author: authors.leila, date: '2026-07-01', readingTime: 7, image: images.article(7, 'network'), body: filler('Digital transformation') },
  { slug: 'design-systems-that-scale', title: 'Design systems that scale across web and mobile', excerpt: 'Tokens, governance and component APIs that keep design and engineering in sync.', category: 'Web', tags: ['Design Systems', 'UX'], author: authors.kabir, date: '2026-06-20', readingTime: 6, image: images.article(8, 'web'), body: filler('Design systems') },
]

export const getArticle = (slug: string) => articles.find((a) => a.slug === slug)
