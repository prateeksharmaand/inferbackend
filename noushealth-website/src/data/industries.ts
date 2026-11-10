import { images } from '../config/images'
import type { Industry } from './types'

export const industries: Industry[] = [
  { slug: 'healthcare', title: 'Healthcare', icon: 'heart', description: 'Secure patient platforms, telehealth and clinical workflow software.', services: ['Software Development', 'Mobile', 'AI'], image: images.healthcare },
  { slug: 'fintech', title: 'FinTech', icon: 'landmark', description: 'Payments, lending and wealth platforms built with compliance in mind.', services: ['Enterprise', 'Cloud', 'Security'], image: images.fintech },
  { slug: 'retail', title: 'Retail', icon: 'shopping', description: 'Omnichannel commerce, loyalty and inventory experiences.', services: ['Web', 'Mobile', 'Data'], image: images.retail },
  { slug: 'education', title: 'Education', icon: 'graduation', description: 'Learning platforms, content delivery and student engagement tools.', services: ['Web', 'UI/UX', 'Cloud'], image: images.education },
  { slug: 'logistics', title: 'Logistics', icon: 'truck', description: 'Fleet tracking, routing and supply-chain visibility in real time.', services: ['Software Development', 'IoT', 'Cloud'], image: images.logistics },
  { slug: 'real-estate', title: 'Real Estate', icon: 'home', description: 'Listing portals, property management and tenant experiences.', services: ['Web', 'Mobile', 'Enterprise'], image: images.realEstate },
  { slug: 'manufacturing', title: 'Manufacturing', icon: 'factory', description: 'Shop-floor telemetry, quality analytics and ERP integration.', services: ['Enterprise', 'AI', 'Cloud'], image: images.manufacturing },
  { slug: 'saas', title: 'SaaS', icon: 'layers', description: 'Multi-tenant product engineering from MVP through scale.', services: ['Software Development', 'DevOps', 'UI/UX'], image: images.saas },
  { slug: 'travel', title: 'Travel', icon: 'plane', description: 'Booking engines, itinerary apps and partner integrations.', services: ['Mobile', 'Web', 'Integrations'], image: images.travel },
  { slug: 'professional-services', title: 'Professional Services', icon: 'briefcase', description: 'Client portals, knowledge systems and workflow automation.', services: ['Automation', 'AI', 'Web'], image: images.professional },
]
