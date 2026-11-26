'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader } from '@/components/app/states';
import { useOrg } from '@/hooks/use-session';

const TABS = [
  { href: '/settings', label: 'Organization', perm: 'apps.read' },
  { href: '/settings/members', label: 'Members', perm: 'apps.read' },
  { href: '/settings/automation', label: 'Automation & limits', perm: 'budgets.read' },
  { href: '/settings/billing', label: 'Billing', perm: 'billing.manage' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/audit', label: 'Activity log', perm: 'org.manage' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { can } = useOrg();
  if (path.startsWith('/settings/organizations')) return children;
  return (
    <>
      <PageHeader title="Settings" description="Organization profile, brand, team, spending safeguards and your account security." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b" role="tablist">
        {TABS.filter((t) => !t.perm || can(t.perm)).map((t) => {
          const active = t.href === '/settings' ? path === t.href : path.startsWith(t.href);
          return <Link key={t.href} href={t.href} role="tab" aria-selected={active} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.label}</Link>;
        })}
      </div>
      {children}
    </>
  );
}
