import type { Service } from './types'

const commonFaqs = (topic: string): Service['faqs'] => [
  {
    question: `How do you scope a ${topic} engagement?`,
    answer:
      'We start with a short discovery phase to align on goals, constraints and success metrics, then provide a phased plan with clear milestones and estimates.',
  },
  {
    question: 'Can you work alongside our in-house team?',
    answer:
      'Yes. We embed with existing teams, adopt your tooling and ways of working, and can transition ownership gradually.',
  },
  {
    question: 'What does ongoing support look like?',
    answer: 'Retainers cover monitoring, security patches, performance tuning and a roadmap of incremental improvements.',
  },
]

export const services: Service[] = [
  {
    slug: 'software-development',
    title: 'Software Development',
    short: 'Custom enterprise and business applications.',
    icon: 'code',
    headline: 'Custom software engineered around the way you work',
    overview:
      'We build reliable, maintainable business software — from internal tools to customer-facing platforms — using proven architecture and rigorous engineering practices.',
    capabilities: [
      { title: 'Custom application development', description: 'Purpose-built systems that fit your workflows instead of forcing you to adapt.' },
      { title: 'API & integration engineering', description: 'Clean, versioned APIs and integrations with ERP, CRM and payment systems.' },
      { title: 'Legacy modernization', description: 'Incremental migration of aging systems with no big-bang risk.' },
      { title: 'Product engineering', description: 'MVP to scale — with automated testing and release pipelines from day one.' },
    ],
    technologies: ['Node.js', '.NET', 'Java', 'Python', 'PostgreSQL', 'Redis', 'Docker'],
    benefits: [
      { title: 'Predictable delivery', description: 'Iterative sprints with demos every two weeks.' },
      { title: 'Maintainable code', description: 'Typed, tested and documented so any team can extend it.' },
      { title: 'Built to scale', description: 'Architecture that grows with users and data.' },
    ],
    relatedCaseStudies: ['healthcare-platform', 'logistics-management-system'],
    faqs: commonFaqs('software development'),
  },
  {
    slug: 'web-development',
    title: 'Web Development',
    short: 'High-performance websites and web applications.',
    icon: 'globe',
    headline: 'Fast, accessible web experiences that convert',
    overview:
      'From marketing sites to complex web applications, we build for performance, accessibility and SEO — measured against real Core Web Vitals.',
    capabilities: [
      { title: 'Web applications', description: 'Rich SPAs and server-rendered apps with React and Next.js.' },
      { title: 'Marketing & e-commerce sites', description: 'Conversion-focused experiences with headless CMS and commerce.' },
      { title: 'Progressive web apps', description: 'Installable, offline-capable experiences across devices.' },
      { title: 'Performance engineering', description: 'Audit and optimize for Lighthouse and Core Web Vitals.' },
    ],
    technologies: ['React', 'Next.js', 'TypeScript', 'Angular', 'Node.js', 'Tailwind CSS'],
    benefits: [
      { title: 'Lightning performance', description: 'Budgets enforced in CI so speed never regresses.' },
      { title: 'Accessible by default', description: 'WCAG-aligned components and testing.' },
      { title: 'SEO-ready', description: 'Semantic structure, metadata and structured data.' },
    ],
    relatedCaseStudies: ['fintech-application', 'ai-operations-platform'],
    faqs: commonFaqs('web development'),
  },
  {
    slug: 'mobile-development',
    title: 'Mobile App Development',
    short: 'iOS and Android applications using modern frameworks.',
    icon: 'smartphone',
    headline: 'Mobile apps people keep on their home screen',
    overview:
      'We ship native-quality iOS and Android apps with Flutter and React Native, backed by robust APIs, analytics and release automation.',
    capabilities: [
      { title: 'Cross-platform apps', description: 'One codebase, two platforms, native performance.' },
      { title: 'Offline-first design', description: 'Reliable sync for field teams and low-connectivity users.' },
      { title: 'App store delivery', description: 'Release management, beta channels and store optimization.' },
      { title: 'Device integrations', description: 'Camera, biometrics, BLE, payments and push notifications.' },
    ],
    technologies: ['Flutter', 'React Native', 'Swift', 'Kotlin', 'Firebase', 'GraphQL'],
    benefits: [
      { title: 'Faster to market', description: 'Shared code cuts delivery time significantly.' },
      { title: 'Polished UX', description: 'Platform-appropriate interactions and motion.' },
      { title: 'Measurable', description: 'Analytics and crash reporting from launch.' },
    ],
    relatedCaseStudies: ['healthcare-platform', 'logistics-management-system'],
    faqs: commonFaqs('mobile'),
  },
  {
    slug: 'ai-automation',
    title: 'AI & Automation',
    short: 'AI-powered products, intelligent workflows and automation.',
    icon: 'brain',
    headline: 'Practical AI that removes work, not adds risk',
    overview:
      'We design and ship LLM applications, predictive models and workflow automation with evaluation, guardrails and observability built in.',
    capabilities: [
      { title: 'LLM applications', description: 'Retrieval-augmented assistants and copilots grounded in your data.' },
      { title: 'Process automation', description: 'Intelligent document handling and back-office workflows.' },
      { title: 'Predictive analytics', description: 'Forecasting and anomaly detection models in production.' },
      { title: 'AI governance', description: 'Evaluation harnesses, privacy controls and audit trails.' },
    ],
    technologies: ['OpenAI', 'Python', 'Machine Learning', 'LLM Applications', 'PostgreSQL', 'Azure'],
    benefits: [
      { title: 'Grounded in your data', description: 'Answers you can trace back to sources.' },
      { title: 'Safe by design', description: 'Guardrails, red-teaming and human review loops.' },
      { title: 'Measured ROI', description: 'Clear baselines and success metrics.' },
    ],
    relatedCaseStudies: ['ai-operations-platform', 'fintech-application'],
    faqs: commonFaqs('AI'),
  },
  {
    slug: 'cloud-devops',
    title: 'Cloud & DevOps',
    short: 'Cloud infrastructure, CI/CD, scalability and monitoring.',
    icon: 'cloud',
    headline: 'Infrastructure that scales and stays secure',
    overview:
      'We architect cloud platforms, automate delivery pipelines and put observability in place so releases are frequent and boring.',
    capabilities: [
      { title: 'Cloud architecture', description: 'Well-architected designs on AWS, Azure and Google Cloud.' },
      { title: 'CI/CD pipelines', description: 'Automated build, test and deploy with progressive rollouts.' },
      { title: 'Infrastructure as code', description: 'Reproducible environments with Terraform.' },
      { title: 'Monitoring & SRE', description: 'SLOs, alerting and incident response practices.' },
    ],
    technologies: ['AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'GitHub Actions'],
    benefits: [
      { title: 'Lower cloud spend', description: 'Right-sizing and FinOps reviews.' },
      { title: 'Safer releases', description: 'Automated checks and instant rollbacks.' },
      { title: 'Resilient', description: 'Multi-zone designs with tested recovery.' },
    ],
    relatedCaseStudies: ['logistics-management-system', 'fintech-application'],
    faqs: commonFaqs('cloud'),
  },
  {
    slug: 'ui-ux-design',
    title: 'UI/UX Design',
    short: 'Research-driven interfaces and digital experiences.',
    icon: 'palette',
    headline: 'Design grounded in how people actually use products',
    overview:
      'Our designers pair user research with systems thinking to create interfaces that are clear, consistent and ready for engineering.',
    capabilities: [
      { title: 'User research', description: 'Interviews, usability testing and journey mapping.' },
      { title: 'Product & interaction design', description: 'Flows, wireframes and high-fidelity prototypes.' },
      { title: 'Design systems', description: 'Tokens and component libraries shared with engineering.' },
      { title: 'UX audits', description: 'Heuristic reviews with prioritized fixes.' },
    ],
    technologies: ['Figma', 'Storybook', 'React', 'Tailwind CSS', 'Framer Motion'],
    benefits: [
      { title: 'Higher conversion', description: 'Friction removed from key journeys.' },
      { title: 'Consistency', description: 'One system across web and mobile.' },
      { title: 'Faster handoff', description: 'Specs that engineers can build from directly.' },
    ],
    relatedCaseStudies: ['fintech-application', 'healthcare-platform'],
    faqs: commonFaqs('design'),
  },
  {
    slug: 'enterprise-solutions',
    title: 'Enterprise Solutions',
    short: 'Large-scale business platforms and integrations.',
    icon: 'building',
    headline: 'Platforms built for complexity, compliance and scale',
    overview:
      'We deliver enterprise-grade platforms with SSO, audit, role-based access and integrations into the systems your business already runs on.',
    capabilities: [
      { title: 'Business platforms', description: 'Workflow, portal and back-office systems at scale.' },
      { title: 'System integration', description: 'ERP, CRM, data warehouse and identity integration.' },
      { title: 'Security & compliance', description: 'Controls aligned with SOC 2, ISO 27001 and GDPR.' },
      { title: 'Data platforms', description: 'Pipelines, analytics and reporting layers.' },
    ],
    technologies: ['Java', '.NET', 'PostgreSQL', 'Kubernetes', 'Azure', 'Terraform'],
    benefits: [
      { title: 'Governed delivery', description: 'Clear reporting and risk management.' },
      { title: 'Security-first', description: 'Threat modelling and reviews built in.' },
      { title: 'Integrates cleanly', description: 'Works with your existing landscape.' },
    ],
    relatedCaseStudies: ['logistics-management-system', 'healthcare-platform'],
    faqs: commonFaqs('enterprise'),
  },
  {
    slug: 'it-consulting',
    title: 'IT Consulting',
    short: 'Technology strategy, architecture and modernization.',
    icon: 'compass',
    headline: 'Senior technical guidance for confident decisions',
    overview:
      'Our architects help you evaluate options, de-risk investments and build a pragmatic roadmap — then stay on to see it delivered.',
    capabilities: [
      { title: 'Technology strategy', description: 'Roadmaps aligned to business outcomes.' },
      { title: 'Architecture review', description: 'Independent assessment of scalability and risk.' },
      { title: 'Cloud migration planning', description: 'Rehost, replatform or refactor — with costs.' },
      { title: 'Engineering excellence', description: 'Process, quality and delivery coaching.' },
    ],
    technologies: ['AWS', 'Azure', 'Kubernetes', 'Terraform', 'Python', 'Java'],
    benefits: [
      { title: 'Independent advice', description: 'Vendor-neutral recommendations.' },
      { title: 'Reduced risk', description: 'Surface issues before they become costly.' },
      { title: 'Actionable', description: 'Roadmaps your team can execute.' },
    ],
    relatedCaseStudies: ['fintech-application', 'logistics-management-system'],
    faqs: commonFaqs('consulting'),
  },
]

export const getService = (slug: string) => services.find((s) => s.slug === slug)
