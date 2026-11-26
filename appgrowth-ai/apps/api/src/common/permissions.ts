/** Organization-level permissions. System roles are seeded from ROLE_PERMISSIONS (prisma/seed.ts). */
export const PERMISSIONS = {
  'org.manage': 'Edit organization settings, brand kit and automation policy',
  'members.manage': 'Invite, remove and change roles of members',
  'billing.manage': 'Change subscription plan and view invoices',
  'apps.read': 'View applications',
  'apps.write': 'Add, edit and remove applications',
  'integrations.read': 'View connected accounts',
  'integrations.manage': 'Connect and disconnect advertising and analytics accounts',
  'campaigns.read': 'View campaigns',
  'campaigns.write': 'Create and edit campaign drafts',
  'campaigns.launch': 'Launch, pause and resume campaigns; approve strategies',
  'budgets.read': 'View budgets and spend',
  'budgets.write': 'Set budgets and spending limits',
  'creatives.read': 'View creatives',
  'creatives.write': 'Generate and edit creatives',
  'creatives.approve': 'Approve or reject creatives',
  'ai.run': 'Run AI agents',
  'analytics.read': 'View analytics',
  'reports.read': 'View and download reports',
  'reports.write': 'Generate reports',
  'automation.manage': 'Change autonomy level, emergency stop and workflows',
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionKey[];
const READ = ALL.filter((p) => p.endsWith('.read'));
export const ROLE_PERMISSIONS: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  owner: { name: 'Owner', description: 'Full control including billing', permissions: ALL },
  admin: { name: 'Admin', description: 'Everything except billing', permissions: ALL.filter((p) => p !== 'billing.manage') },
  marketer: {
    name: 'Marketer', description: 'Runs apps, creatives and campaigns',
    permissions: [...READ, 'apps.write', 'campaigns.write', 'campaigns.launch', 'creatives.write', 'creatives.approve', 'ai.run', 'reports.write'],
  },
  analyst: { name: 'Analyst', description: 'Reads data and produces reports', permissions: [...READ, 'reports.write'] },
  viewer: { name: 'Viewer', description: 'Read-only access', permissions: READ },
};
