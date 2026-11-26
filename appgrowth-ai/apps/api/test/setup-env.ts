// e2e tests run against a dedicated database (appgrowth_test by default) — never the dev or production DB.
import { readFileSync } from 'fs';
import { join } from 'path';
for (const line of readFileSync(join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/appgrowth(\?|$)/, '/appgrowth_test$1');
if (!/appgrowth_test/.test(process.env.DATABASE_URL)) throw new Error('Refusing to run e2e tests against a non-test database');
process.env.REDIS_URL = (process.env.REDIS_URL ?? 'redis://localhost:6379/5').replace(/\/\d+$/, '/6');
process.env.THROTTLE_DISABLED = 'true';
process.env.NODE_ENV = 'test';
