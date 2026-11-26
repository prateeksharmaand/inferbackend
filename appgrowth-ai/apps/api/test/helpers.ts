import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';

import { StoreService } from '../src/modules/store/store.service';

/** Store lookups are stubbed in tests: no dependency on Apple/Google availability. */
export const fakeStore = {
  androidPackageExists: async (pkg: string) => (pkg.startsWith('com.missing') ? false : true),
  lookupIos: async (q: { appleAppId?: string; bundleId?: string }) => (q.appleAppId === '404404404' || q.bundleId === 'com.missing.ios' ? null : {
    title: 'Fit Tracker', subtitle: '', description: 'Track workouts.', developer: 'Example Ltd', rating: 4.6, ratingCount: 1200, iconUrl: 'https://example.test/icon.png',
    screenshotUrls: ['https://example.test/1.png'], category: 'Health & Fitness', storeUrl: 'https://apps.apple.com/in/app/fit/id123456789', appleAppId: q.appleAppId ?? '123456789',
    bundleId: q.bundleId ?? 'com.example.fit', raw: {}, source: 'itunes_lookup' as const,
  }),
  playListing: async () => null,
  googleServiceToken: async () => 'token',
};

export async function makeApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(StoreService).useValue(fakeStore).compile();
  const app = mod.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

let n = 0;
export const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const PASSWORD = 'Sup3rSecretPass';

/** Registers a user+org through the API and returns a Bearer-authenticated client bound to that org. */
export async function signUp(app: INestApplication, orgName = 'Acme') {
  const email = `u-${uniq()}@example.test`;
  const reg = await request(app.getHttpServer()).post('/api/v1/auth/register?client=api').send({ name: 'Test User', email, password: PASSWORD, organizationName: orgName }).expect(201);
  const token = reg.body.accessToken as string;
  const orgId = reg.body.organization.id as string;
  const as = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, org: string | null = orgId) => {
    const r = request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
    return org ? r.set('X-Organization-Id', org) : r;
  };
  return { email, token, refreshToken: reg.body.refreshToken as string, orgId, userId: reg.body.user.id as string, as };
}
