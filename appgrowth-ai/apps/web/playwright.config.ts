import { defineConfig, devices } from '@playwright/test';

/** End-to-end tests against a running stack (API + worker + web). BASE_URL defaults to the local dev setup. */
export default defineConfig({
  testDir: './e2e', timeout: 90_000, fullyParallel: false, retries: 0, reporter: [['list']],
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ }],
});
