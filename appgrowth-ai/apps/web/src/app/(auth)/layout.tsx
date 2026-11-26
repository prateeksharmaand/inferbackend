import Link from 'next/link';
import { Logo } from '@/components/app/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Link href="/" aria-label="AppGrowth AI home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Nous Healthcare Solutions</p>
      </div>
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,.12),transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-primary-foreground">
          <p className="max-w-md text-3xl font-semibold leading-tight">Plan, launch and optimise app install campaigns — within the budget you set.</p>
          <ul className="mt-6 space-y-2 text-sm opacity-90">
            <li>• AI market research, ASO audits and growth plans for Android and iOS</li>
            <li>• Campaigns on Google, Apple, Meta and TikTok through their official APIs</li>
            <li>• Hard spending limits, approvals and a full audit trail</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
