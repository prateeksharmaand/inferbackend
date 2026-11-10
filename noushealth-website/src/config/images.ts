/**
 * Centralised image configuration.
 * Each entry is either a remote/local URL (`src`) or, when `src` is omitted,
 * a generated on-brand illustration based on `seed` + `kind`.
 * Replace `src` with a real photo/screenshot at any time — nothing else changes.
 */
export type ArtKind = 'network' | 'cloud' | 'mobile' | 'web' | 'data' | 'ai' | 'team' | 'office' | 'enterprise' | 'code'

export interface ImageAsset {
  alt: string
  kind: ArtKind
  seed: number
  src?: string
}

const img = (kind: ArtKind, seed: number, alt: string, src?: string): ImageAsset => ({ kind, seed, alt, src })

/** Unsplash photo URL builder (width is appended by <Art> for responsive srcset). */
const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70`

const articlePhotos: Record<number, string> = {
  1: photo('1526374965328-7f61d4dc18c5'),
  2: photo('1488590528505-98d2b5aba04b'),
  3: photo('1558494949-ef010cbdcc31'),
  4: photo('1512941937669-90a1b58e7e9c'),
  5: photo('1517694712202-14dd9538aa97'),
  6: photo('1518770660439-4636190af475'),
  7: photo('1451187580459-43490279c0fa'),
  8: photo('1519389950473-47ba0277781c'),
}

export const images = {
  about: img('office', 3, 'Engineers collaborating around a product roadmap in a bright studio', photo('1522071820081-009f0129c71c')),
  aboutSecondary: img('team', 5, 'Design and engineering team reviewing a prototype', photo('1552664730-d307ca884978')),
  ctaBackdrop: img('network', 9, ''),
  healthcare: img('data', 11, 'Clinician using a healthcare mobile app', photo('1576091160399-112ba8d25d1d')),
  fintech: img('enterprise', 12, 'Team reviewing financial plans on laptops', photo('1454165804606-c3d57bc86b40')),
  ai: img('ai', 13, 'Laptop glowing in the dark representing AI computing', photo('1531297484001-80022131f5a1')),
  logistics: img('network', 14, 'Large warehouse with stacked inventory', photo('1586528116311-ad8dd3c8310d')),
  retail: img('mobile', 15, 'Shop assistant and customer using mobile payments', photo('1556742049-0cfed4f6a45d')),
  education: img('web', 16, 'Students collaborating with laptops', photo('1523240795612-9a054b0db644')),
  realEstate: img('enterprise', 17, 'Miniature house with keys', photo('1560518883-ce09059eeffa')),
  manufacturing: img('cloud', 18, 'Engineer working on industrial machinery', photo('1581091226825-a6a2a5aee158')),
  saas: img('code', 19, 'Analytics dashboard on a laptop', photo('1460925895917-afdab827c52f')),
  travel: img('mobile', 20, 'Travel essentials laid out on a map', photo('1488646953014-85cb44e25828')),
  professional: img('office', 21, 'Team presentation in a modern office', photo('1556761175-5973dc0f32e7')),
  article: (n: number, kind: ArtKind = 'code') => img(kind, 30 + n, 'Article cover image', articlePhotos[n]),
  shots: [
    img('data', 41, 'Analytics dashboard screenshot', photo('1551288049-bebda4e38f71')),
    img('web', 42, 'Product interface on laptop', photo('1460925895917-afdab827c52f')),
    img('mobile', 43, 'Mobile app on smartphone', photo('1512941937669-90a1b58e7e9c')),
  ],
} as const
