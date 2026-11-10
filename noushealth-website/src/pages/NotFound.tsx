import { PageHero } from '../components/PageHero'
import { Button } from '../components/Button'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'

export default function NotFound() {
  useSeo(pageSeo.notFound)
  return (
    <PageHero eyebrow="404" title="This page took a wrong turn" description="The page you're looking for doesn't exist or has moved.">
      <div className="flex flex-col gap-3 sm:flex-row"><Button to="/" arrow>Back to home</Button><Button to="/contact" variant="ghost">Contact us</Button></div>
    </PageHero>
  )
}
