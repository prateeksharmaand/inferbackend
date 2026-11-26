import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

export interface StepCtx { organizationId: string; executionId: string; subjectId: string | null; input: Record<string, unknown>; outputs: Record<string, unknown> }
export type StepResult = { status: 'SUCCEEDED' | 'SKIPPED'; output?: unknown; note?: string };
export interface StepDef { key: string; critical?: boolean; run: (ctx: StepCtx) => Promise<StepResult> }
export interface WorkflowDef { key: string; steps: StepDef[]; onFinish?: (ctx: StepCtx, ok: boolean) => Promise<void> }
interface StepRecord { key: string; status: string; startedAt?: string; finishedAt?: string; output?: unknown; error?: string; note?: string }

/**
 * Executes workflow runs step by step, persisting each step's status so a retried job resumes after the last
 * succeeded step instead of repeating side effects. Critical step failure stops the run; other failures are recorded
 * and the run continues, finishing as FAILED.
 */
@Injectable()
export class WorkflowEngine {
  private log = new Logger('Workflows');
  private defs = new Map<string, WorkflowDef>();
  constructor(private prisma: PrismaService) {}

  register(def: WorkflowDef) { this.defs.set(def.key, def); }
  registered() { return [...this.defs.keys()]; }

  async run(executionId: string, input: Record<string, unknown> = {}) {
    const exec = await this.prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } });
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(exec.status)) return exec.status;
    const def = this.defs.get(exec.workflowKey);
    if (!def) throw new Error(`No workflow implementation for ${exec.workflowKey}`);
    const steps: StepRecord[] = (exec.steps as unknown as StepRecord[]) ?? [];
    const ctx: StepCtx = { organizationId: exec.organizationId, executionId, subjectId: exec.subjectId, input, outputs: Object.fromEntries(steps.filter((s) => s.status === 'SUCCEEDED').map((s) => [s.key, s.output])) };
    await this.prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'RUNNING', startedAt: exec.startedAt ?? new Date() } });
    const save = (current: string | null) => this.prisma.workflowExecution.update({ where: { id: executionId }, data: { steps: steps as unknown as Prisma.InputJsonValue, currentStep: current } });
    let failed = false;
    for (const step of def.steps) {
      const prev = steps.find((s) => s.key === step.key);
      if (prev && (prev.status === 'SUCCEEDED' || prev.status === 'SKIPPED')) continue;
      const rec: StepRecord = { key: step.key, status: 'RUNNING', startedAt: new Date().toISOString() };
      if (prev) steps.splice(steps.indexOf(prev), 1, rec); else steps.push(rec);
      await save(step.key);
      try {
        const r = await step.run(ctx);
        Object.assign(rec, { status: r.status, output: r.output, note: r.note, finishedAt: new Date().toISOString() });
        ctx.outputs[step.key] = r.output;
      } catch (e) {
        failed = true;
        Object.assign(rec, { status: 'FAILED', error: (e as Error).message.slice(0, 1000), finishedAt: new Date().toISOString() });
        this.log.warn(`${exec.workflowKey}/${step.key} failed: ${(e as Error).message}`);
        if (step.critical) { await save(null); break; }
      }
      await save(null);
    }
    const status = failed ? 'FAILED' : 'SUCCEEDED';
    const errors = steps.filter((s) => s.status === 'FAILED').map((s) => `${s.key}: ${s.error}`);
    await this.prisma.workflowExecution.update({ where: { id: executionId }, data: { status, finishedAt: new Date(), currentStep: null, error: errors.join(' | ').slice(0, 2000) || null } });
    await def.onFinish?.(ctx, !failed).catch((e) => this.log.error(`onFinish ${exec.workflowKey}: ${(e as Error).message}`));
    return status;
  }
}
