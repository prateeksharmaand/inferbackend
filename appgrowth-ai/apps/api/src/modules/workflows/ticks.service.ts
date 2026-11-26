import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AgentKey, LLM_AGENTS, Orchestrator } from '../ai/orchestrator.service';
import { WorkflowKey, WorkflowStarter } from './workflow-starter.service';

/** Workflows that change spend or campaigns only run for organizations whose automation is on. */
const MUTATING: WorkflowKey[] = ['campaign_monitoring', 'budget_optimization'];

/** Fans a scheduled tick out to one idempotent execution per organization. */
@Injectable()
export class Ticks {
  private log = new Logger('Ticks');
  constructor(private prisma: PrismaService, private starter: WorkflowStarter, private orch: Orchestrator) {}

  async handle(data: { kind: 'workflow' | 'agent'; key: string }, tickTime: number) {
    const slot = new Date(Math.floor(tickTime / 60_000) * 60_000).toISOString();
    await this.prisma.scheduledJob.updateMany({ where: { key: `${data.kind === 'workflow' ? 'wf' : 'agent'}:${data.key}` }, data: { lastRunAt: new Date(), lastStatus: 'running' } });
    const orgs = await this.prisma.organization.findMany({ where: { status: 'ACTIVE', deletedAt: null, applications: { some: { deletedAt: null, status: 'active' } } }, select: { id: true, automationEnabled: true } });
    let started = 0;
    for (const o of orgs) {
      try {
        if (data.kind === 'workflow') {
          if (MUTATING.includes(data.key as WorkflowKey) && !o.automationEnabled) continue;
          const r = await this.starter.start({ organizationId: o.id, key: data.key as WorkflowKey, idempotencyKey: `${data.key}:${o.id}:${slot}`, input: { scheduledFor: slot } });
          if (r.created) started++;
        } else if ((LLM_AGENTS as readonly string[]).includes(data.key)) {
          const exists = await this.prisma.aiAgentExecution.count({ where: { organizationId: o.id, agentKey: data.key, trigger: 'schedule', createdAt: { gte: new Date(tickTime - 60_000) } } });
          if (!exists) { await this.orch.enqueue(o.id, data.key as AgentKey, {}, { trigger: 'schedule' }); started++; }
        }
      } catch (e) {
        this.log.warn(`${data.key} for ${o.id}: ${(e as Error).message}`);
      }
    }
    await this.prisma.scheduledJob.updateMany({ where: { key: `${data.kind === 'workflow' ? 'wf' : 'agent'}:${data.key}` }, data: { lastStatus: `started ${started}` } });
    return { started, organizations: orgs.length };
  }
}
