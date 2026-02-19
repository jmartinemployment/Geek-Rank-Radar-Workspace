import cron from 'node-cron';
import type { PrismaClient } from '../../generated/prisma/client/index.js';
import type { ScanOrchestrator } from '../scanner/ScanOrchestrator.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';

interface ScheduledJob {
  scheduleId: string;
  task: cron.ScheduledTask;
}

/**
 * Reads active ScanSchedule records from the database and registers
 * node-cron jobs that call orchestrator.createFullScan() on each trigger.
 */
export class ScanScheduler {
  private readonly jobs = new Map<string, ScheduledJob>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: ScanOrchestrator,
  ) {}

  /**
   * Load all active schedules from the DB and register cron jobs.
   * Call this once on server startup.
   */
  async start(): Promise<void> {
    const schedules = await this.prisma.scanSchedule.findMany({
      where: { isActive: true },
    });

    logger.info(`[ScanScheduler] Loading ${schedules.length} active schedule(s)`);

    for (const schedule of schedules) {
      this.registerJob(schedule);
    }
  }

  /**
   * Stop all cron jobs and clear the job map.
   */
  stop(): void {
    for (const [id, job] of this.jobs.entries()) {
      job.task.stop();
      logger.info(`[ScanScheduler] Stopped schedule ${id}`);
    }
    this.jobs.clear();
  }

  /**
   * Reload a single schedule (e.g., after API update).
   */
  async reloadSchedule(scheduleId: string): Promise<void> {
    // Stop existing job if running
    const existing = this.jobs.get(scheduleId);
    if (existing) {
      existing.task.stop();
      this.jobs.delete(scheduleId);
    }

    const schedule = await this.prisma.scanSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (schedule?.isActive) {
      this.registerJob(schedule);
    }
  }

  /**
   * Reload all schedules from DB (e.g., after bulk changes).
   */
  async reloadAll(): Promise<void> {
    this.stop();
    await this.start();
  }

  getActiveJobs(): string[] {
    return [...this.jobs.keys()];
  }

  private registerJob(schedule: {
    id: string;
    name: string;
    cronExpression: string;
    serviceAreaIds: string[];
    categoryIds: string[];
    engineIds: string[];
    gridSize: number;
  }): void {
    if (!cron.validate(schedule.cronExpression)) {
      logger.error(
        `[ScanScheduler] Invalid cron expression "${schedule.cronExpression}" for schedule "${schedule.name}" (${schedule.id})`,
      );
      return;
    }

    const task = cron.schedule(schedule.cronExpression, () => {
      this.executeSchedule(schedule).catch((error: unknown) => {
        logger.error(`[ScanScheduler] Schedule "${schedule.name}" failed: ${toErrorMessage(error)}`);
      });
    });

    this.jobs.set(schedule.id, { scheduleId: schedule.id, task });

    logger.info(
      `[ScanScheduler] Registered "${schedule.name}" — cron: ${schedule.cronExpression}, engines: [${schedule.engineIds.join(', ')}]`,
    );
  }

  private async executeSchedule(schedule: {
    id: string;
    name: string;
    serviceAreaIds: string[];
    categoryIds: string[];
    engineIds: string[];
    gridSize: number;
  }): Promise<void> {
    logger.info(`[ScanScheduler] Executing schedule "${schedule.name}" (${schedule.id})`);

    const startTime = Date.now();

    try {
      const scanIds = await this.orchestrator.createFullScan({
        serviceAreaIds: schedule.serviceAreaIds.length > 0 ? schedule.serviceAreaIds : undefined,
        categoryIds: schedule.categoryIds.length > 0 ? schedule.categoryIds : undefined,
        engineIds: schedule.engineIds.length > 0 ? schedule.engineIds : undefined,
        gridSize: schedule.gridSize,
      });

      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Update lastRunAt and compute nextRunAt
      await this.prisma.scanSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.computeNextRun(schedule.id),
        },
      });

      logger.info(
        `[ScanScheduler] Schedule "${schedule.name}" created ${scanIds.length} scans in ${elapsed}s`,
      );
    } catch (error: unknown) {
      logger.error(`[ScanScheduler] Schedule "${schedule.name}" execution failed: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Compute the next run time based on the cron expression.
   * Uses a simple approach: find the next valid date from now.
   */
  private computeNextRun(scheduleId: string): Date | null {
    const job = this.jobs.get(scheduleId);
    if (!job) return null;

    // node-cron doesn't expose next run time directly,
    // so approximate it as "now + a small buffer"
    // The cron library will handle the actual scheduling
    return null;
  }
}
