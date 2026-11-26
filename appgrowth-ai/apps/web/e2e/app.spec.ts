import { expect, Page, test } from '@playwright/test';
import { authenticator } from 'otplib';

const PASSWORD = 'Sup3rSecretPass';
const errorsOf = (page: Page) => { const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404/.test(m.text())) errs.push(m.text()); }); return errs; };
async function expectHealthy(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
}

test.describe.serial('customer journey', () => {
  const email = `e2e-${Date.now()}@example.test`;
  let page: Page; let errs: string[];
  test.beforeAll(async ({ browser }) => { page = await browser.newPage(); errs = errorsOf(page); });

  test('registers and lands on add-app', async () => {
    await page.goto('/register');
    await page.fill('#name', 'E2E Owner'); await page.fill('#organizationName', 'E2E Apps'); await page.fill('#email', email); await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL('**/apps/new**');
    await expect(page.getByRole('heading', { name: /add your first app/i })).toBeVisible();
  });

  test('adds an iOS app from its App Store link with imported metadata', async () => {
    await page.fill('input[aria-label="Store link"]', 'https://apps.apple.com/in/app/whatsapp-messenger/id310633997');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('iOS · net.whatsapp.WhatsApp')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#name')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Add app' }).click();
    await page.waitForURL(/\/apps\/[0-9a-f-]{36}$/);
    await expect(page.getByText('AI onboarding')).toBeVisible();
    await page.getByRole('tab', { name: 'Store listing' }).click();
    await expect(page.getByText(/App Store/).first()).toBeVisible();
  });

  test('onboarding reports honestly when no AI provider is configured', async () => {
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByText('Import store metadata')).toBeVisible();
    await expect.poll(async () => page.locator('.text-destructive').count(), { timeout: 60_000 }).toBeGreaterThan(0); // research step fails visibly
  });

  test('sets a budget, drafts a campaign and sees policy-aware screens', async () => {
    await page.goto('/budgets');
    await page.fill('#ml', '150000'); await page.fill('#dl', '6000');
    await page.getByRole('button', { name: 'Save budget' }).click();
    await expect(page.getByText('Budget saved')).toBeVisible();
    await page.goto('/campaigns/new');
    await page.fill('#name', 'Search India');
    await page.selectOption('#app', { index: 1 });
    await page.selectOption('#ch', 'APPLE_ADS');
    await page.fill('#db', '2000');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByText(/Choose a connected ad account first/)).toBeVisible(); // no account → can't proceed
  });

  test('every customer page renders without errors', async () => {
    for (const p of ['/dashboard', '/analytics', '/apps', '/insights', '/creatives', '/campaigns', '/budgets', '/automation', '/integrations', '/reports', '/notifications', '/support', '/settings', '/settings/members', '/settings/automation', '/settings/billing', '/settings/security', '/settings/audit']) await expectHealthy(page, p);
    expect(errs).toEqual([]);
  });

  test('integrations are honest about availability', async () => {
    await page.goto('/integrations');
    await expect(page.getByText('Not available yet').first()).toBeVisible();
    await expect(page.getByText(/Implemented · awaiting live verification/).first()).toBeVisible();
  });
});

test('home page works on a phone @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('super admin console requires and accepts two-factor', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL; const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (a local Super Admin) to run this test');
  const secret = process.env.E2E_ADMIN_TOTP_SECRET;
  const errs = errorsOf(page);
  await page.goto('/login');
  await page.fill('#email', email!); await page.fill('#password', password!);
  await page.click('button[type=submit]');
  const codeField = page.locator('#mfaCode');
  await Promise.race([codeField.waitFor({ timeout: 15_000 }), page.waitForURL('**/admin', { timeout: 15_000 })]).catch(() => undefined);
  if (await codeField.isVisible()) {
    test.skip(!secret, 'Admin already has 2FA: set E2E_ADMIN_TOTP_SECRET to run this test');
    await page.fill('#mfaCode', authenticator.generate(secret!)); await page.click('button[type=submit]');
  }
  await page.waitForURL('**/admin');
  const gate = page.getByText('Two-factor authentication required');
  await gate.or(page.getByRole('heading', { name: 'Platform dashboard' })).first().waitFor();
  if (await gate.isVisible()) {
    await page.getByRole('button', { name: 'Set up authenticator app' }).click();
    const s = (await page.locator('code').first().textContent())!.trim();
    console.log(`E2E admin TOTP secret (local test account only): ${s}`);
    await page.fill('#code', authenticator.generate(s)); await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('heading', { name: 'Platform dashboard' })).toBeVisible();
  }
  for (const p of ['/admin', '/admin/organizations', '/admin/users', '/admin/campaigns', '/admin/ai', '/admin/integrations', '/admin/plans', '/admin/support', '/admin/flags', '/admin/system', '/admin/jobs', '/admin/usage', '/admin/audit']) await expectHealthy(page, p);
  expect(errs).toEqual([]);
});
