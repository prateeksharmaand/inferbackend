import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';

declare global { interface BigInt { toJSON(): string } }
// Money is BigInt minor units; JSON carries it as a string so no precision is lost.
BigInt.prototype.toJSON = function () { return this.toString(); };

const REQUIRED = ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'DATA_ENCRYPTION_KEY', 'PUBLIC_URL'];

/** Shared app configuration (main.ts and e2e tests). */
export function configureApp(app: INestApplication) {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if ((process.env.JWT_ACCESS_SECRET ?? '').length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  if (process.env.NODE_ENV === 'production' && process.env.THROTTLE_DISABLED === 'true') throw new Error('THROTTLE_DISABLED is not allowed in production');
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  // Keep the raw bytes: webhook signatures are computed over the exact body.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as unknown as { rawBody: Buffer }).rawBody = buf; } }));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3100').split(','), credentials: true });
  const http = app.getHttpAdapter().getInstance();
  http.set?.('trust proxy', 1);
  http.disable?.('x-powered-by');
}
