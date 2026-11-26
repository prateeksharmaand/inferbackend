import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QUEUES, queue } from '../../queues/queues';

export type WorkflowKey = 'app_onboarding' | 'campaign_creation' | 'campaign_monitoring' | 'budget_optimization' | 'daily_reporting' | 'monthly_planning' | 'integration_health';

/**
 * Starts a workflow execution exactly once per idempotency key: the DB row is the source of truth and the BullMQ
 * job id equals the execution id, so retries of the same request never start a second run.
 */
@Injectable()
export class WorkflowStarter {
  constructor(private prisma: PrismaService) {}

  async start(p: { organizationId: string; key: WorkflowKey; idempotencyKey: string; subjectType?: string; subjectId?: string; input?: Record<string, unknown> }) {
    const wf = await this.prisma.automationWorkflow.findUnique({ where: { key: p.key } });
    if (!wf) throw new AppError(`Workflow ${p.key} is not installed`, 503, 'not_initialised');
    if (!wf.enabled) throw new AppError(`The ${wf.name} workflow is disabled by the platform administrator`, 409, 'workflow_disabled');
    const existing = await this.prisma.workflowExecution.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
    if (existing) return { execution: existing, created: false };
    try {
      const execution = await this.prisma.workflowExecution.create({
        data: { organizationId: p.organizationId, workflowKey: p.key, version: wf.currentVersion, subjectType: p.subjectType, subjectId: p.subjectId, idempotencyKey: p.idempotencyKey, steps: [], status: 'QUEUED' },
      });
      await queue(QUEUES.workflows).add(p.key, { executionId: execution.id, organizationId: p.organizationId, input: p.input ?? {} }, { jobId: execution.id });
      return { execution, created: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { execution: await this.prisma.workflowExecution.findUniqueOrThrow({ where: { idempotencyKey: p.idempotencyKey } }), created: false };
      }
      throw e;
    }
  }
}
