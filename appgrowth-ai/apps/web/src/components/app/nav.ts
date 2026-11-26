import { LifeBuoy, BarChart3, Bell, Bot, Boxes, Building2, ClipboardList, Cog, CreditCard, FileText, Flag, Gauge, HeartPulse, Lightbulb, Megaphone, Palette, PlugZap, ScrollText, Server, Smartphone, Users, Wallet } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: string }
export const APP_NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: Gauge, perm: 'apps.read' },
    { href: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.read' },
  ] },
  { section: 'Grow', items: [
    { href: '/apps', label: 'Applications', icon: Smartphone, perm: 'apps.read' },
    { href: '/insights', label: 'Research & strategy', icon: Lightbulb, perm: 'apps.read' },
    { href: '/creatives', label: 'Creative studio', icon: Palette, perm: 'creatives.read' },
    { href: '/campaigns', label: 'Campaigns', icon: Megaphone, perm: 'campaigns.read' },
    { href: '/budgets', label: 'Budgets', icon: Wallet, perm: 'budgets.read' },
  ] },
  { section: 'Operate', items: [
    { href: '/automation', label: 'AI & automation', icon: Bot, perm: 'apps.read' },
    { href: '/integrations', label: 'Integrations', icon: PlugZap, perm: 'integrations.read' },
    { href: '/reports', label: 'Reports', icon: FileText, perm: 'reports.read' },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/support', label: 'Support', icon: LifeBuoy },
    { href: '/settings', label: 'Settings', icon: Cog, perm: 'apps.read' },
  ] },
];

export const ADMIN_NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Platform', items: [
    { href: '/admin', label: 'Dashboard', icon: Gauge },
    { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/campaigns', label: 'Campaigns', icon: Megaphone },
    { href: '/admin/ai', label: 'AI providers & agents', icon: Bot },
    { href: '/admin/integrations', label: 'Integrations', icon: PlugZap },
  ] },
  { section: 'Business', items: [
    { href: '/admin/plans', label: 'Plans & billing', icon: CreditCard },
    { href: '/admin/support', label: 'Support', icon: ClipboardList },
    { href: '/admin/flags', label: 'Feature flags', icon: Flag },
  ] },
  { section: 'System', items: [
    { href: '/admin/system', label: 'System health', icon: HeartPulse },
    { href: '/admin/jobs', label: 'Background jobs', icon: Boxes },
    { href: '/admin/usage', label: 'API & storage usage', icon: Server },
    { href: '/admin/audit', label: 'Audit & security logs', icon: ScrollText },
  ] },
];
