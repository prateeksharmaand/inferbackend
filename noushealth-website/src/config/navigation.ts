export interface NavItem {
  label: string
  to: string
  children?: { label: string; to: string }[]
}

export const mainNav: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/services' },
  { label: 'Solutions', to: '/solutions' },
  { label: 'Industries', to: '/industries' },
  { label: 'About', to: '/about' },
  { label: 'Case Studies', to: '/case-studies' },
  { label: 'Insights', to: '/insights' },
  { label: 'Contact', to: '/contact' },
]

export const footerColumns = [
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Careers', to: '/about#team' },
      { label: 'Contact', to: '/contact' },
      { label: 'Partners', to: '/about#partners' },
    ],
  },
  {
    title: 'Services',
    links: [
      { label: 'Software Development', to: '/services/software-development' },
      { label: 'Web Development', to: '/services/web-development' },
      { label: 'Mobile Development', to: '/services/mobile-development' },
      { label: 'AI', to: '/services/ai-automation' },
      { label: 'Cloud', to: '/services/cloud-devops' },
      { label: 'UI/UX', to: '/services/ui-ux-design' },
    ],
  },
  {
    title: 'Industries',
    links: [
      { label: 'Healthcare', to: '/industries#healthcare' },
      { label: 'FinTech', to: '/industries#fintech' },
      { label: 'Retail', to: '/industries#retail' },
      { label: 'Education', to: '/industries#education' },
      { label: 'Logistics', to: '/industries#logistics' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Case Studies', to: '/case-studies' },
      { label: 'Blog', to: '/insights' },
      { label: 'FAQs', to: '/services#faq' },
    ],
  },
]
