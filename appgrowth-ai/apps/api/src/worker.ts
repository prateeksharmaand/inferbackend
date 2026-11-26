import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { jobCounter } from './common/metrics';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { CreativesService } from './modules/creatives/creatives.service';
import { Orchestrator } from './modules/ai/orchestrator.service';
import { WorkflowEngine } from './modules/workflows/workflow-engine.service';
import { Ticks } from './modules/workflows/ticks.service';
import { QUEUES, redisConnection } from './queues/queues';
import { WorkerModule } from './worker.module';
import { registerProcessors } from './processors';

declare global { interface BigInt { toJSON(): string } }
BigInt.prototype.toJSON = function () { return this.toString(); };

/**
 * Worker process: consumes every queue. Work never runs on the HTTP request path. Failed jobs retry with exponential
 * backoff; after the last attempt they stay in the failed set (dead letter) for inspection/retry in the admin console.
 */
async function main() {
  const log = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  const prisma = app.get(PrismaService); const redis = app.get(RedisService);
  const handlers = registerProcessors(app);
  const engine = app.get(WorkflowEngine); const orch = app.get(Orchestrator);
  const ticks = app.get(Ticks);
  handlers[QUEUES.workflows] = async (job: Job) => (job.name === 'tick' ? ticks.handle(job.data, job.timestamp) : engine.run(job.data.executionId, job.data.input ?? {}));
  const creatives = app.get(CreativesService);
  handlers[QUEUES.agents] = async (job: Job) => (job.name === 'media' ? creatives.generateMedia(job.data) : (await orch.execute(job.data.executionId)).status);

  const concurrency: Record<string, number> = { workflows: 2, agents: 2, campaigns: 2, sync: 2, analytics: 1, reports: 1, notifications: 2 };
  const workers = Object.values(QUEUES).map((name) => {
    const w = new Worker(name, async (job) => {
      const h = handlers[name];
      if (!h) throw new Error(`No handler for queue ${name}`);
      return h(job);
    }, { connection: redisConnection(), prefix: 'ag', concurrency: concurrency[name] ?? 1, lockDuration: 15 * 60_000 });
    w.on('completed', () => jobCounter.inc({ queue: name, outcome: 'completed' }));
    w.on('failed', async (job, err) => {
      jobCounter.inc({ queue: name, outcome: 'failed' });
      log.warn(`${name}/${job?.name}#${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await prisma.errorLog.create({ data: { service: 'worker', organizationId: (job.data as { organizationId?: string }).organizationId ?? null, message: `${name}/${job.name}: ${err.message}`.slice(0, 2000), context: { jobId: job.id } } }).catch(() => undefined);
      }
    });
    return w;
  });
  const beat = setInterval(() => void redis.client.set('heartbeat:worker', String(Date.now()), 'EX', 300), 30_000);
  await redis.client.set('heartbeat:worker', String(Date.now()), 'EX', 300);
  log.log(`Worker started: ${Object.values(QUEUES).join(', ')}`);
  const stop = async () => { clearInterval(beat); await Promise.all(workers.map((w) => w.close())); await app.close(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main();
