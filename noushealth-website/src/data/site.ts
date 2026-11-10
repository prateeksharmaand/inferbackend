import type { FAQ, IconKey } from './types'

export const clients = ['Finova', 'Medix', 'CloudCore', 'RetailX', 'NexBank', 'LogiPro', 'Learnly', 'Voltra']

export const heroStats = ['10+ Years Experience', '100+ Projects Delivered', 'Global Clients', 'Dedicated Engineering Teams']

export const stats = [
  { value: 100, suffix: '+', label: 'Projects' },
  { value: 50, suffix: '+', label: 'Engineers' },
  { value: 15, suffix: '+', label: 'Countries' },
  { value: 10, suffix: '+', label: 'Years Experience' },
]

export const whyStats = [
  { value: 98, suffix: '%', label: 'Client Retention' },
  { value: 100, suffix: '+', label: 'Products Delivered' },
  { value: 15, suffix: '+', label: 'Countries Served' },
  { value: 24, suffix: '/7', label: 'Technical Support' },
]

export const benefits: { icon: IconKey; title: string; description: string }[] = [
  { icon: 'target', title: 'Product-focused engineering', description: 'We optimize for business outcomes, not lines of code.' },
  { icon: 'users', title: 'Senior technical teams', description: 'Experienced engineers and architects on every engagement.' },
  { icon: 'eye', title: 'Transparent communication', description: 'Weekly demos, open roadmaps and honest reporting.' },
  { icon: 'gauge', title: 'Scalable architecture', description: 'Systems designed for tomorrow’s load, not just today’s.' },
  { icon: 'shield', title: 'Security-first development', description: 'Threat modelling and secure defaults throughout.' },
  { icon: 'handshake', title: 'Long-term partnership', description: 'We stay for the journey — launch is just the beginning.' },
]

export const processSteps = [
  { n: '01', title: 'Discover', description: 'Understand business goals and user requirements.', icon: 'search' as IconKey },
  { n: '02', title: 'Design', description: 'Create UX architecture and visual design.', icon: 'pen' as IconKey },
  { n: '03', title: 'Build', description: 'Develop scalable and maintainable software.', icon: 'code' as IconKey },
  { n: '04', title: 'Test', description: 'Perform functional, performance and security testing.', icon: 'flask' as IconKey },
  { n: '05', title: 'Launch', description: 'Deploy and monitor production systems.', icon: 'rocket' as IconKey },
  { n: '06', title: 'Scale', description: 'Continuously improve and evolve the product.', icon: 'trending' as IconKey },
]

export const showcase = [
  { id: 'ai', label: 'AI', title: 'Intelligent products and workflows', text: 'LLM assistants, predictive models and automation grounded in your own data — with evaluation and guardrails.', points: ['Retrieval-augmented assistants', 'Document intelligence', 'Predictive analytics'], kind: 'ai' as const },
  { id: 'cloud', label: 'Cloud', title: 'Cloud platforms that scale', text: 'Resilient architectures, infrastructure as code and CI/CD that make releases routine.', points: ['Multi-cloud architecture', 'Kubernetes & containers', 'Observability & SRE'], kind: 'cloud' as const },
  { id: 'mobile', label: 'Mobile', title: 'Mobile apps with native polish', text: 'Cross-platform apps for iOS and Android with offline support and measurable engagement.', points: ['Flutter & React Native', 'Offline-first sync', 'Store release automation'], kind: 'mobile' as const },
  { id: 'web', label: 'Web', title: 'Web experiences built for speed', text: 'Accessible, SEO-ready web apps with performance budgets enforced in CI.', points: ['React & Next.js', 'Headless CMS & commerce', 'Core Web Vitals tuning'], kind: 'web' as const },
  { id: 'data', label: 'Data', title: 'Data platforms that inform decisions', text: 'Pipelines, warehouses and dashboards that turn raw events into insight.', points: ['ETL & streaming', 'Warehouse modelling', 'Self-serve analytics'], kind: 'data' as const },
]

export const about = {
  heading: 'We Turn Complex Technology Into Simple Business Solutions.',
  story: 'Founded in 2014 by a small group of engineers frustrated with over-engineered software, Nous Healthcare has grown into a global team that ships production systems for startups and enterprises alike. We believe great technology should disappear into the business it serves.',
  mission: 'To help businesses use technology to create better products, smarter operations and stronger customer experiences.',
  vision: 'To be the most trusted engineering partner for ambitious companies building the next generation of digital products.',
  philosophy: 'Start simple. Measure everything. Automate the boring parts. Leave every codebase better than we found it.',
}

export const homeFaqs: FAQ[] = [
  { question: 'What type of software do you develop?', answer: 'Custom web applications, mobile apps, enterprise platforms, AI-powered products and cloud-native systems — from MVPs to large-scale platforms.' },
  { question: 'Do you work with startups?', answer: 'Absolutely. We offer MVP packages, fractional engineering teams and technical co-founder-level advice for early-stage companies.' },
  { question: 'Can you take over an existing project?', answer: 'Yes. We begin with a code and architecture audit, stabilise the system, then plan improvements without disrupting your users.' },
  { question: 'Do you provide UI/UX design?', answer: 'Yes — research, interaction design, prototyping and design systems, delivered by designers who work alongside our engineers.' },
  { question: 'Can you build mobile applications?', answer: 'We build iOS and Android apps with Flutter, React Native and native stacks, including backend APIs and release automation.' },
  { question: 'Do you provide cloud and DevOps services?', answer: 'Yes. We design cloud architectures, automate CI/CD, manage infrastructure as code and set up monitoring and SRE practices.' },
  { question: 'How does your development process work?', answer: 'We follow six stages — Discover, Design, Build, Test, Launch and Scale — with two-week sprints and a demo at the end of each.' },
  { question: 'Do you provide long-term maintenance?', answer: 'Yes. Support plans cover monitoring, security updates, performance tuning and continuous improvement.' },
]

export const solutions = [
  { icon: 'layers' as IconKey, title: 'SaaS Product Engineering', text: 'Multi-tenant platforms from MVP to scale, with billing, analytics and admin tooling.' },
  { icon: 'brain' as IconKey, title: 'Intelligent Automation', text: 'AI copilots and workflow automation that remove repetitive work.' },
  { icon: 'database' as IconKey, title: 'Data & Analytics Platforms', text: 'Pipelines, warehouses and dashboards that make data usable.' },
  { icon: 'cloud' as IconKey, title: 'Cloud Modernization', text: 'Migrate and refactor legacy systems to resilient cloud-native architectures.' },
  { icon: 'building' as IconKey, title: 'Enterprise Integration', text: 'Connect ERP, CRM and internal tools through secure APIs and events.' },
  { icon: 'shield' as IconKey, title: 'Secure Digital Foundations', text: 'Identity, compliance and security engineering baked into every release.' },
]

export const budgets = ['Under $10k', '$10k – $25k', '$25k – $75k', '$75k – $200k', '$200k+', 'Not sure yet']
