import { Link } from 'react-router-dom'
import { company } from '../config/company'

/** Nous Healthcare wordmark. `light` = white version for dark backgrounds (hero, footer). */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center" aria-label={`${company.companyName} home`}>
      <img
        src={light ? '/logos/nous-logo-white.svg' : '/logos/nous-logo.svg'}
        alt={company.companyName}
        width={354}
        height={95}
        className="h-9 w-auto lg:h-10"
      />
    </Link>
  )
}
