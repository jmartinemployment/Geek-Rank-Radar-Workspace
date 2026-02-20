import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../utils/response.js';
import { validateBody } from '../middleware/validator.js';
import type { EmailEnrichmentService } from '../services/enrichment/EmailEnrichmentService.js';

const enrichEmailsSchema = z.object({
  onlyMissing: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  businessIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
});

export function createEnrichmentRoutes(enrichmentService: EmailEnrichmentService): Router {
  const router = Router();

  /**
   * POST /api/enrichment/emails
   * Trigger email enrichment for businesses with websites.
   * Runs async — returns immediately, poll GET /status for progress.
   */
  router.post('/emails', validateBody(enrichEmailsSchema), (req, res) => {
    if (enrichmentService.isRunning()) {
      sendError(res, 'Enrichment is already running. Check GET /api/enrichment/status for progress.', 409, 'ALREADY_RUNNING');
      return;
    }

    const options = req.body as z.infer<typeof enrichEmailsSchema>;

    // Fire and forget — runs in background
    enrichmentService.enrich(options).catch(() => {});

    sendSuccess(res, {
      message: 'Email enrichment started',
      options,
    }, 202);
  });

  /**
   * GET /api/enrichment/status
   * Get current enrichment progress.
   */
  router.get('/status', (_req, res) => {
    sendSuccess(res, enrichmentService.getProgress());
  });

  /**
   * POST /api/enrichment/stop
   * Stop a running enrichment job.
   */
  router.post('/stop', (_req, res) => {
    if (!enrichmentService.isRunning()) {
      sendError(res, 'No enrichment job is running', 400, 'NOT_RUNNING');
      return;
    }

    enrichmentService.stop();
    sendSuccess(res, { message: 'Enrichment stop requested' });
  });

  return router;
}
