"use client";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Bell, Bot, Briefcase, Building2, CalendarDays, FileText, GraduationCap, LayoutDashboard, LogOut, Mail,
  Menu as MenuIcon, Moon, Search, Settings, Sparkles, Sun, Users, Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useMe } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { authApi, notificationApi } from "@/services";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs", label: "Discover Jobs", icon: Search },
  { href: "/shortlist", label: "AI Shortlist", icon: Sparkles },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/recruiters", label: "Recruiters", icon: Users },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/resumes", label: "Resume Studio", icon: FileText },
  { href: "/cover-letters", label: "Cover Letters", icon: Mail },
  { href: "/interview", label: "Interview Coach", icon: GraduationCap },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/agent", label: "Career Agent", icon: Bot },
  { href: "/automation", label: "Agent Automation", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => {
      const next = !dark;
      document.documentElement.classList.toggle("dark", next);
      try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* storage blocked */ }
      setDark(next);
    }}>{dark ? <Sun /> : <Moon />}</Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const unread = useQuery({ queryKey: ["unread"], queryFn: notificationApi.unread, refetchInterval: 60_000, enabled: me.isSuccess });

  useEffect(() => {
    if (me.isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me.isError, pathname, router]);
  useEffect(() => { setOpen(false); }, [pathname]);

  if (me.isLoading || me.isError) {
    return <div className="flex h-screen items-center justify-center"><Skeleton className="h-8 w-48" /></div>;
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors",
              active ? "bg-white/10 font-medium text-white" : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white")}>
            <Icon className="size-4" />{label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center gap-2 px-6">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkles className="size-4" /></div>
          <span className="font-semibold text-white">CareerPilot AI</span>
        </div>
        {nav}
        <div className="border-t border-white/10 p-3">
          <div className="truncate px-3 text-xs text-sidebar-foreground/70">{me.data?.email}</div>
          <button className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
            onClick={async () => { await authApi.logout().catch(() => null); window.location.href = "/login"; }}>
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><MenuIcon /></Button>
          <div className="flex-1" />
          <Link href="/settings?tab=notifications" className="relative rounded-md p-2 hover:bg-muted" aria-label="Notifications">
            <Bell className="size-4" />
            {!!unread.data?.count && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">{Math.min(unread.data.count, 9)}</span>}
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
