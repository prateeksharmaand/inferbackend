import { Module } from '@nestjs/common';
import { OnboardingWorkflow } from './modules/workflows/onboarding.workflow';
import { AutomationWorkflows } from './modules/workflows/automation.workflows';
import { Ticks } from './modules/workflows/ticks.service';
import { ServicesModule } from './services.module';

/** Background worker process: workflow definitions + queue processors. */
@Module({ imports: [ServicesModule], providers: [OnboardingWorkflow, AutomationWorkflows, Ticks] })
export class WorkerModule {}
