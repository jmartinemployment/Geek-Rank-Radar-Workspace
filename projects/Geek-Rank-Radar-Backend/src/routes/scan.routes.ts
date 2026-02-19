import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../config/database.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import { validateBody, validateQuery } from '../middleware/validator.js';
import type { ScanOrchestrator } from '../services/scanner/ScanOrchestrator.js';

const createScanSchema = z.object({
  serviceAreaId: z.string().uuid(),
  categoryId: z.string().uuid(),
  keyword: z.string().min(1),
  searchEngine: z.string().min(1),
  gridSize: z.number().int().min(3).max(9).optional(),
});

const fullScanSchema = z.object({
  serviceAreaIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  engineIds: z.array(z.string().min(1)).optional(),
  gridSize: z.number().int().min(3).max(9).optional(),
});

const listScansSchema = z.object({
  status: z.string().optional(),
  searchEngine: z.string().optional(),
  serviceAreaId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createScanRoutes(orchestrator: ScanOrchestrator): Router {
  const router = Router();

  // POST /api/scans — Create and queue a new scan
  router.post('/', validateBody(createScanSchema), async (req, res, next) => {
    try {
      const scanId = await orchestrator.createScan(req.body);
      const scan = await getPrisma().scan.findUnique({
        where: { id: scanId },
        include: { serviceArea: true, category: true },
      });
      sendSuccess(res, scan, 201);
    } catch (error: unknown) {
      next(error);
    }
  });

  // POST /api/scans/full — Create a full multi-engine scan
  router.post('/full', validateBody(fullScanSchema), async (req, res, next) => {
    try {
      const scanIds = await orchestrator.createFullScan(req.body);
      const scans = await getPrisma().scan.findMany({
        where: { id: { in: scanIds } },
        include: { serviceArea: true, category: true },
        orderBy: { createdAt: 'desc' },
      });
      sendSuccess(res, {
        scanIds,
        totalScans: scanIds.length,
        scans,
      }, 201);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/scans — List scans
  router.get('/', validateQuery(listScansSchema), async (req, res, next) => {
    try {
      const { status, searchEngine, serviceAreaId, categoryId, page, limit } = req.query as unknown as z.infer<typeof listScansSchema>;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (searchEngine) where.searchEngine = searchEngine;
      if (serviceAreaId) where.serviceAreaId = serviceAreaId;
      if (categoryId) where.categoryId = categoryId;

      const [scans, total] = await Promise.all([
        getPrisma().scan.findMany({
          where,
          include: { serviceArea: true, category: true },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        getPrisma().scan.count({ where }),
      ]);

      sendPaginated(res, scans, {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/scans/:id — Get scan details
  router.get('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const scan = await getPrisma().scan.findUnique({
        where: { id },
        include: { serviceArea: true, category: true },
      });
      if (!scan) {
        sendError(res, 'Scan not found', 404);
        return;
      }
      sendSuccess(res, {
        ...scan,
        percentComplete: scan.pointsTotal > 0
          ? Math.round((scan.pointsCompleted / scan.pointsTotal) * 100)
          : 0,
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/scans/:id/results — Get scan results with rankings
  router.get('/:id/results', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const scan = await getPrisma().scan.findUnique({
        where: { id },
        include: {
          serviceArea: true,
          category: true,
          points: {
            include: {
              rankings: {
                include: { business: true },
                orderBy: { rankPosition: 'asc' },
              },
            },
            orderBy: [{ gridRow: 'asc' }, { gridCol: 'asc' }],
          },
        },
      });
      if (!scan) {
        sendError(res, 'Scan not found', 404);
        return;
      }
      sendSuccess(res, scan);
    } catch (error: unknown) {
      next(error);
    }
  });

  // DELETE /api/scans/:id — Cancel a scan
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const scan = await getPrisma().scan.findUnique({ where: { id } });
      if (!scan) {
        sendError(res, 'Scan not found', 404);
        return;
      }
      if (scan.status === 'completed' || scan.status === 'failed') {
        sendError(res, 'Cannot cancel a finished scan', 400);
        return;
      }
      await getPrisma().scan.update({
        where: { id },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      sendSuccess(res, { message: 'Scan cancelled' });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
