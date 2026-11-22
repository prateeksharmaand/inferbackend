import type { IconKey } from './types'

export interface Product {
  slug: string
  name: string
  tagline: string
  description: string
  icon: IconKey
  url: string
  urlLabel: string
  image: { src: string; alt: string }
  features: string[]
  audience: string
}

/** Products built and run by Nous Healthcare. */
export const products: Product[] = [
  {
    slug: 'infer-health',
    name: 'Infer Health',
    tagline: 'AI-native ambient EMR for Indian clinics',
    description:
      'Doctors dictate naturally in 15+ Indian languages; Infer transcribes the consultation, extracts the SOAP note and fills every clinical field, alongside OPD queue, lab portal and billing.',
    icon: 'heart',
    url: 'https://inferapp.online',
    urlLabel: 'inferapp.online',
    image: { src: '/case-studies/infer-health.jpg', alt: 'Infer Health EMR showing an AI-extracted SOAP note' },
    features: ['AI Scribe in 15+ Indian languages', 'Structured SOAP notes with ICD codes', 'OPD queue, lab portal and billing', 'ABDM-ready'],
    audience: 'Clinics and hospitals',
  },
  {
    slug: 'careerpilot-ai',
    name: 'CareerPilot AI',
    tagline: 'AI co-pilot for senior tech job search',
    description:
      'Finds new openings every morning, scores each one against your real experience, prepares a tailored resume and cover letter, and tracks every application, recruiter and interview. You approve every step.',
    icon: 'briefcase',
    url: 'https://careerpilot.noushealthcare.online',
    urlLabel: 'careerpilot.noushealthcare.online',
    image: { src: '/product-shots/careerpilot.jpg', alt: 'CareerPilot AI overview dashboard with job matches and applications' },
    features: [
      'Daily job discovery and 6-factor AI match scoring',
      'Tailored, fact-checked resumes and cover letters',
      'Application tracker, recruiter outreach and Interview Coach',
      'Shortlists and reminders by email and Telegram',
    ],
    audience: 'Experienced engineers and tech leaders',
  },
]
