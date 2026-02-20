import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { loadEnvironment } from './config/environment.js';
import { logger } from './config/logger.js';
import { getPrisma, disconnectPrisma } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import healthRoutes from './routes/health.routes.js';
import { createScanRoutes } from './routes/scan.routes.js';
import { createBusinessRoutes } from './routes/business.routes.js';
import { createCategoryRoutes, createServiceAreaRoutes } from './routes/category.routes.js';
import { createSystemRoutes } from './routes/system.routes.js';
import { createScheduleRoutes } from './routes/schedule.routes.js';
import { createEnrichmentRoutes } from './routes/enrichment.routes.js';
import { ScanOrchestrator } from './services/scanner/ScanOrchestrator.js';
import { ScanScheduler } from './services/scheduler/ScanScheduler.js';
import { EmailEnrichmentService } from './services/enrichment/EmailEnrichmentService.js';

const env = loadEnvironment();
const app = express();

// Middleware
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use(rateLimiter);

// Health check (outside /api prefix)
app.use(healthRoutes);

// Initialize services
const prisma = getPrisma();
const orchestrator = new ScanOrchestrator(prisma);
const scheduler = new ScanScheduler(prisma, orchestrator);
const enrichmentService = new EmailEnrichmentService(prisma);

// API routes
app.use('/api/scans', createScanRoutes(orchestrator));
app.use('/api/businesses', createBusinessRoutes());
app.use('/api/categories', createCategoryRoutes());
app.use('/api/service-areas', createServiceAreaRoutes());
app.use('/api/system', createSystemRoutes(orchestrator));
app.use('/api/schedules', createScheduleRoutes(scheduler, orchestrator));
app.use('/api/enrichment', createEnrichmentRoutes(enrichmentService));

// Error handler (must be last)
app.use(errorHandler);

// Keep-alive: prevent Render free tier from sleeping (pings own health endpoint every 14 min)
const KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(port: number): void {
  keepAliveTimer = setInterval(() => {
    fetch(`http://localhost:${port}/health`).catch(() => {
      // Ignore errors — this is just to keep the process active
    });
  }, KEEP_ALIVE_INTERVAL_MS);
  logger.info(`[KeepAlive] Self-ping every 14 min to prevent Render sleep`);
}

// Start server
app.listen(env.PORT, () => {
  logger.info(`Rank Radar backend running on port ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Health check: http://localhost:${env.PORT}/health`);

  // Recover orphaned scans from previous service restart
  orchestrator.recoverOrphanedScans().catch((error: unknown) => {
    logger.error(`[ScanOrchestrator] Recovery failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  // Start cron scheduler after server is listening
  scheduler.start().catch((error: unknown) => {
    logger.error(`[ScanScheduler] Failed to start: ${error instanceof Error ? error.message : String(error)}`);
  });

  // Keep the service alive on Render free tier
  if (env.NODE_ENV === 'production') {
    startKeepAlive(env.PORT);
  }
});

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  logger.info('Shutting down...');
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  scheduler.stop();
  await disconnectPrisma();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
