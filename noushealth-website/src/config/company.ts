export interface SocialLink {
  id: 'linkedin' | 'x' | 'instagram' | 'facebook' | 'github'
  label: string
  href: string
}

export interface CompanyConfig {
  companyName: string
  tagline: string
  logo: string | null
  primaryColor: string
  secondaryColor: string
  accentColor: string
  email: string
  phone: string
  address: string
  socialLinks: SocialLink[]
  foundedYear: number
}

/** Central brand configuration — replace these values to rebrand the site. */
export const company: CompanyConfig = {
  companyName: 'Nous Healthcare',
  tagline: 'Engineering Digital Products That Move Businesses Forward',
  logo: null, // set to an image URL to replace the default monogram
  primaryColor: '#4f46e5',
  secondaryColor: '#0ea5e9',
  accentColor: '#22d3ee',
  email: 'info@noushealthcare.online',
  phone: '+919650269758',
  address: 'Jaipur, India',
  foundedYear: 2014,
  socialLinks: [
    { id: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com' },
    { id: 'x', label: 'X', href: 'https://x.com' },
    { id: 'instagram', label: 'Instagram', href: 'https://instagram.com' },
    { id: 'facebook', label: 'Facebook', href: 'https://facebook.com' },
    { id: 'github', label: 'GitHub', href: 'https://github.com' },
  ],
}
