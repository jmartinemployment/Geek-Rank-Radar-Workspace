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
import { ScanOrchestrator } from './services/scanner/ScanOrchestrator.js';
import { ScanScheduler } from './services/scheduler/ScanScheduler.js';

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

// API routes
app.use('/api/scans', createScanRoutes(orchestrator));
app.use('/api/businesses', createBusinessRoutes());
app.use('/api/categories', createCategoryRoutes());
app.use('/api/service-areas', createServiceAreaRoutes());
app.use('/api/system', createSystemRoutes(orchestrator));
app.use('/api/schedules', createScheduleRoutes(scheduler, orchestrator));

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(env.PORT, () => {
  logger.info(`Rank Radar backend running on port ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Health check: http://localhost:${env.PORT}/health`);

  // Start cron scheduler after server is listening
  scheduler.start().catch((error: unknown) => {
    logger.error(`[ScanScheduler] Failed to start: ${error instanceof Error ? error.message : String(error)}`);
  });
});

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  logger.info('Shutting down...');
  scheduler.stop();
  await disconnectPrisma();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
