import { Router } from 'express';
import { getPrisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import type { ScanOrchestrator } from '../services/scanner/ScanOrchestrator.js';

export function createSystemRoutes(orchestrator: ScanOrchestrator): Router {
  const router = Router();

  // GET /api/system/engine-status — Per-engine status
  router.get('/engine-status', (_req, res) => {
    const engines = orchestrator.getEngines();
    const statuses: Record<string, unknown>[] = [];

    for (const [engineId, engine] of engines) {
      const state = engine.getState();
      statuses.push({
        engineId,
        status: engine.getStatus(),
        requestsThisHour: state.requestsThisHour,
        requestsToday: state.requestsToday,
        lastRequestAt: state.lastRequestAt,
        blockedUntil: state.blockedUntil,
      });
    }

    sendSuccess(res, statuses);
  });

  // GET /api/system/scan-queue — Current queue depth
  router.get('/scan-queue', (_req, res) => {
    const engines = orchestrator.getEngines();
    const queue = orchestrator.getQueue();
    const depths: Record<string, number> = {};

    for (const engineId of engines.keys()) {
      depths[engineId] = queue.getQueueDepth(engineId);
    }

    sendSuccess(res, {
      totalDepth: queue.getTotalDepth(),
      processing: queue.isProcessing(),
      engines: depths,
    });
  });

  // GET /api/system/stats — Database stats
  router.get('/stats', async (_req, res, next) => {
    try {
      const [
        businessCount,
        scanCount,
        serviceAreaCount,
        categoryCount,
        rankingCount,
      ] = await Promise.all([
        getPrisma().business.count({ where: { isActive: true } }),
        getPrisma().scan.count(),
        getPrisma().serviceArea.count({ where: { isActive: true } }),
        getPrisma().category.count({ where: { isActive: true } }),
        getPrisma().scanRanking.count(),
      ]);

      sendSuccess(res, {
        businesses: businessCount,
        scans: scanCount,
        serviceAreas: serviceAreaCount,
        categories: categoryCount,
        rankings: rankingCount,
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
