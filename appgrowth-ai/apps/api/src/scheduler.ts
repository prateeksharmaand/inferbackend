import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { CommonModule } from './common/common.module';
import { QUEUES, queue } from './queues/queues';

/**
 * Scheduler process. Critical schedules live in Redis as BullMQ job schedulers (not in-memory timers), so a restart
 * or a second scheduler instance never loses or duplicates a tick. Schedules come from automation_workflows and
 * ai_agent_definitions, which the Super Admin edits; this process re-syncs them every 5 minutes.
 */
async function main() {
  const log = new Logger('Scheduler');
  const app = await NestFactory.createApplicationContext(CommonModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService); const redis = app.get(RedisService);
  const q = queue(QUEUES.workflows);

  const sync = async () => {
    const lock = await redis.withLock('scheduler-sync', 60_000, async () => {
      const [workflows, agents] = await Promise.all([prisma.automationWorkflow.findMany(), prisma.aiAgentDefinition.findMany()]);
      const wanted = new Map<string, { cron: string; data: Record<string, string> }>();
      for (const w of workflows) if (w.enabled && w.schedule) wanted.set(`wf:${w.key}`, { cron: w.schedule, data: { kind: 'workflow', key: w.key } });
      // Agents with their own schedule that aren't already run by a workflow.
      for (const a of agents) if (a.enabled && a.schedule && !['budget_optimization'].includes(a.key)) wanted.set(`agent:${a.key}`, { cron: a.schedule, data: { kind: 'agent', key: a.key } });
      const existing = await q.getJobSchedulers();
      for (const s of existing) if (s.key && !wanted.has(s.key)) { await q.removeJobScheduler(s.key); log.log(`removed schedule ${s.key}`); }
      for (const [id, w] of wanted) {
        await q.upsertJobScheduler(id, { pattern: w.cron, tz: 'UTC' }, { name: 'tick', data: w.data, opts: { attempts: 1 } });
        await prisma.scheduledJob.upsert({ where: { key: id }, create: { key: id, queue: QUEUES.workflows, cron: w.cron }, update: { cron: w.cron, enabled: true } });
      }
      await prisma.scheduledJob.updateMany({ where: { key: { notIn: [...wanted.keys()] } }, data: { enabled: false } });
      return wanted.size;
    });
    if (lock.acquired) log.log(`schedules in sync (${lock.value})`);
  };
  await sync();
  const timer = setInterval(() => void sync().catch((e) => log.error(e)), 5 * 60_000);
  await redis.client.set('heartbeat:scheduler', String(Date.now()), 'EX', 900);
  const beat = setInterval(() => void redis.client.set('heartbeat:scheduler', String(Date.now()), 'EX', 900), 60_000);
  const stop = async () => { clearInterval(timer); clearInterval(beat); await app.close(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main();
