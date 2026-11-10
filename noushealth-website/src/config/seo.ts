import { company } from './company'

export interface SeoConfig {
  title: string
  description: string
  path?: string
  image?: string
  type?: 'website' | 'article'
}

export const siteUrl = 'https://noushealthcare.online'
export const defaultImage = `${siteUrl}/og-image.png`

export const pageSeo = {
  home: {
    title: `${company.companyName} — Custom Software, Cloud & AI Development`,
    description:
      'We design, engineer and scale high-performance digital products for startups, growing businesses and enterprises.',
    path: '/',
  },
  services: {
    title: `Services — ${company.companyName}`,
    description: 'Software, web, mobile, AI, cloud, design and consulting services built around your business.',
    path: '/services',
  },
  solutions: {
    title: `Solutions — ${company.companyName}`,
    description: 'Packaged engineering solutions for platforms, automation, data and modernization.',
    path: '/solutions',
  },
  industries: {
    title: `Industries — ${company.companyName}`,
    description: 'Domain expertise across healthcare, fintech, retail, education, logistics and more.',
    path: '/industries',
  },
  about: {
    title: `About — ${company.companyName}`,
    description: 'Meet the team turning complex technology into simple business solutions.',
    path: '/about',
  },
  caseStudies: {
    title: `Case Studies — ${company.companyName}`,
    description: 'Selected projects and measurable business outcomes delivered for our clients.',
    path: '/case-studies',
  },
  insights: {
    title: `Insights — ${company.companyName}`,
    description: 'Engineering perspectives on AI, cloud, web, mobile, security and digital transformation.',
    path: '/insights',
  },
  contact: {
    title: `Contact — ${company.companyName}`,
    description: 'Tell us about your project and get a considered response within one business day.',
    path: '/contact',
  },
  notFound: {
    title: `Page not found — ${company.companyName}`,
    description: 'The page you are looking for could not be found.',
    path: '/404',
  },
} satisfies Record<string, SeoConfig>
