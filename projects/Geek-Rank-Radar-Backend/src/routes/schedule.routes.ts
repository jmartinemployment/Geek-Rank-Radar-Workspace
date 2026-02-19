import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { validateBody } from '../middleware/validator.js';
import type { ScanScheduler } from '../services/scheduler/ScanScheduler.js';
import type { ScanOrchestrator } from '../services/scanner/ScanOrchestrator.js';

const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  cronExpression: z.string().min(9).max(50),
  serviceAreaIds: z.array(z.string().uuid()).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
  engineIds: z.array(z.string().min(1)).default([]),
  gridSize: z.number().int().min(3).max(9).default(7),
  isActive: z.boolean().default(true),
});

const updateScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  cronExpression: z.string().min(9).max(50).optional(),
  serviceAreaIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  engineIds: z.array(z.string().min(1)).optional(),
  gridSize: z.number().int().min(3).max(9).optional(),
  isActive: z.boolean().optional(),
});

export function createScheduleRoutes(scheduler: ScanScheduler, orchestrator: ScanOrchestrator): Router {
  const router = Router();
  const prisma = getPrisma();

  // GET /api/schedules — List all schedules
  router.get('/', async (_req, res, next) => {
    try {
      const schedules = await prisma.scanSchedule.findMany({
        orderBy: { createdAt: 'desc' },
      });

      const activeJobs = scheduler.getActiveJobs();

      const enriched = schedules.map((s) => ({
        ...s,
        isRunning: activeJobs.includes(s.id),
      }));

      sendSuccess(res, enriched);
    } catch (error: unknown) {
      next(error);
    }
  });

  // POST /api/schedules — Create a new schedule
  router.post('/', validateBody(createScheduleSchema), async (req, res, next) => {
    try {
      const schedule = await prisma.scanSchedule.create({
        data: req.body,
      });

      // Register the cron job immediately
      await scheduler.reloadSchedule(schedule.id);

      sendSuccess(res, schedule, 201);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/schedules/:id — Get schedule details
  router.get('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const schedule = await prisma.scanSchedule.findUnique({
        where: { id },
      });
      if (!schedule) {
        sendError(res, 'Schedule not found', 404);
        return;
      }

      const activeJobs = scheduler.getActiveJobs();
      sendSuccess(res, {
        ...schedule,
        isRunning: activeJobs.includes(schedule.id),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  // PATCH /api/schedules/:id — Update a schedule
  router.patch('/:id', validateBody(updateScheduleSchema), async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.scanSchedule.findUnique({ where: { id } });
      if (!existing) {
        sendError(res, 'Schedule not found', 404);
        return;
      }

      const updated = await prisma.scanSchedule.update({
        where: { id },
        data: req.body,
      });

      // Reload the cron job with new settings
      await scheduler.reloadSchedule(id);

      sendSuccess(res, updated);
    } catch (error: unknown) {
      next(error);
    }
  });

  // DELETE /api/schedules/:id — Delete a schedule
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.scanSchedule.findUnique({ where: { id } });
      if (!existing) {
        sendError(res, 'Schedule not found', 404);
        return;
      }

      // Stop the cron job first
      await scheduler.reloadSchedule(id);

      await prisma.scanSchedule.delete({ where: { id } });

      sendSuccess(res, { message: 'Schedule deleted' });
    } catch (error: unknown) {
      next(error);
    }
  });

  // POST /api/schedules/:id/trigger — Manually trigger a schedule now
  router.post('/:id/trigger', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const schedule = await prisma.scanSchedule.findUnique({ where: { id } });
      if (!schedule) {
        sendError(res, 'Schedule not found', 404);
        return;
      }

      const scanIds = await orchestrator.createFullScan({
        serviceAreaIds: schedule.serviceAreaIds.length > 0 ? schedule.serviceAreaIds : undefined,
        categoryIds: schedule.categoryIds.length > 0 ? schedule.categoryIds : undefined,
        engineIds: schedule.engineIds.length > 0 ? schedule.engineIds : undefined,
        gridSize: schedule.gridSize,
      });

      await prisma.scanSchedule.update({
        where: { id },
        data: { lastRunAt: new Date() },
      });

      sendSuccess(res, {
        message: `Triggered "${schedule.name}" — ${scanIds.length} scans created`,
        scanIds,
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
