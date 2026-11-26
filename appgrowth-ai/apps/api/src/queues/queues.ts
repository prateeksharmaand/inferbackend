import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

/** Queue names. Each queue is consumed by the worker process (src/worker.ts); schedules live in src/scheduler.ts. */
export const QUEUES = {
  workflows: 'workflows',       // automation workflow executions (onboarding, campaign creation, monitoring, …)
  agents: 'agents',             // AI agent executions (calls the Python AI service)
  campaigns: 'campaigns',       // campaign execution against ad platform APIs (create/launch/pause/budget)
  sync: 'sync',                 // metrics/spend/attribution sync from providers
  analytics: 'analytics',       // rollups, retention, forecasts
  reports: 'reports',           // PDF/CSV generation
  notifications: 'notifications', // email delivery
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const defaultJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 3, backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 7 * 86_400, count: 5000 }, removeOnFail: { age: 30 * 86_400 }, // failed jobs stay as the dead-letter record
};

let conn: IORedis | null = null;
export const redisConnection = () => (conn ??= new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }));
const cache = new Map<string, Queue>();
export const queue = (name: QueueName) => {
  let q = cache.get(name);
  if (!q) { q = new Queue(name, { connection: redisConnection(), prefix: 'ag', defaultJobOptions }); cache.set(name, q); }
  return q;
};
export const closeQueues = async () => { await Promise.all([...cache.values()].map((q) => q.close())); cache.clear(); await conn?.quit().catch(() => undefined); conn = null; };
