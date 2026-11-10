import {
  Code2, Globe, Smartphone, Brain, Cloud, Palette, Building2, Compass, HeartPulse, Landmark, ShoppingBag,
  GraduationCap, Truck, Home, Factory, Layers, Plane, Briefcase, Users, ShieldCheck, Eye, Gauge, Handshake,
  Target, Database, Search, Rocket, FlaskConical, PenTool, TrendingUp, type LucideIcon,
} from 'lucide-react'
import type { IconKey } from '../data/types'

const map: Record<IconKey, LucideIcon> = {
  code: Code2, globe: Globe, smartphone: Smartphone, brain: Brain, cloud: Cloud, palette: Palette, building: Building2,
  compass: Compass, heart: HeartPulse, landmark: Landmark, shopping: ShoppingBag, graduation: GraduationCap,
  truck: Truck, home: Home, factory: Factory, layers: Layers, plane: Plane, briefcase: Briefcase, users: Users,
  shield: ShieldCheck, eye: Eye, gauge: Gauge, handshake: Handshake, target: Target, database: Database,
  search: Search, rocket: Rocket, flask: FlaskConical, pen: PenTool, trending: TrendingUp,
}

export function Icon({ name, className = 'h-5 w-5' }: { name: IconKey; className?: string }) {
  const C = map[name]
  return <C className={className} aria-hidden="true" />
}
