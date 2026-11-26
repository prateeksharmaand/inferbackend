'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LogOut, Menu, Moon, Plus, Shield, Sun, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { Logo } from './logo';
import type { NavItem } from './nav';

function NavList({ nav, can, onNavigate }: { nav: { section: string; items: NavItem[] }[]; can: (p: string) => boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-6" aria-label="Main">
      {nav.map((s) => {
        const items = s.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={s.section}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.section}</p>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = i.href === '/admin' || i.href === '/dashboard' ? path === i.href : path === i.href || path.startsWith(i.href + '/');
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted hover:text-foreground'}`}>
                      <i.icon className="size-4" />{i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      <Sun className="hidden dark:block" /><Moon className="dark:hidden" />
    </Button>
  );
}

export function AppShell({ nav, children, admin = false }: { nav: { section: string; items: NavItem[] }[]; children: React.ReactNode; admin?: boolean }) {
  const { me, org, orgs, can, switchTo } = useOrg();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const allowed = admin ? () => true : can;

  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST', org: false }); } catch { /* already signed out */ }
    qc.clear(); router.replace('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href={admin ? '/admin' : '/dashboard'} className="px-2"><Logo /></Link>
      {admin
        ? <div className="mx-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">Super Admin console</div>
        : orgs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="min-w-0"><span className="block truncate font-medium">{org?.name}</span><span className="block text-xs text-muted-foreground">{org?.roleName}{org?.status === 'SUSPENDED' ? ' · suspended' : ''}</span></span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                {orgs.map((o) => (
                  <DropdownMenuItem key={o.id} onClick={() => { switchTo(o.id); router.push('/dashboard'); }}>
                    <span className="flex-1 truncate">{o.name}</span>{o.id === org?.id && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings/organizations/new')}><Plus className="size-4" /> New organization</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      <div className="flex-1 overflow-y-auto"><NavList nav={nav} can={allowed} onNavigate={() => setOpen(false)} /></div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/30">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar lg:block">{sidebar}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{sidebar}</SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu /></Button>
          <div className="flex-1" />
          {me && me.platformRole !== 'NONE' && (
            <Button variant="outline" size="sm" onClick={() => router.push(admin ? '/dashboard' : '/admin')}><Shield /> {admin ? 'Customer view' : 'Admin console'}</Button>
          )}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 pr-2 text-sm hover:bg-muted" aria-label="Account menu">
              <span className="grid size-8 place-items-center rounded-full bg-primary/15 font-semibold text-primary">{me?.name?.[0]?.toUpperCase() ?? '?'}</span>
              <span className="hidden max-w-36 truncate sm:block">{me?.name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup><DropdownMenuLabel className="truncate">{me?.email}</DropdownMenuLabel></DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings/security')}><UserRound className="size-4" /> Security & two-factor</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={signOut}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
