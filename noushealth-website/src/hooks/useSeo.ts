import { useEffect } from 'react'
import { defaultImage, siteUrl, type SeoConfig } from '../config/seo'

const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function useSeo({ title, description, path = '/', image = defaultImage, type = 'website' }: SeoConfig) {
  useEffect(() => {
    document.title = title
    const url = `${siteUrl}${path}`
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:image', image)
    setMeta('name', 'twitter:card', 'summary_large_image')
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = url
  }, [title, description, path, image, type])
}
