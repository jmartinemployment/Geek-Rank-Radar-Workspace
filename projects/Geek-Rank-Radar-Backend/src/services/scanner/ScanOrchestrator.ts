import type { PrismaClient } from '../../generated/prisma/client/index.js';
import { ScanQueue } from './ScanQueue.js';
import { BingSearchEngine } from '../engines/BingSearchEngine.js';
import { GoogleSearchEngine } from '../engines/GoogleSearchEngine.js';
import { GoogleLocalEngine } from '../engines/GoogleLocalEngine.js';
import { DuckDuckGoEngine } from '../engines/DuckDuckGoEngine.js';
import { BusinessMatcher } from '../business/BusinessMatcher.js';
import { generateGrid } from '../grid/gridGenerator.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import { sleep } from '../../utils/delay.js';
import type { BaseEngine } from '../engines/BaseEngine.js';
import type { ScanTask, CreateScanRequest, FullScanRequest } from '../../types/scan.types.js';
import type { ParsedBusiness } from '../../types/engine.types.js';

const GOOGLE_ENGINE_IDS = new Set(['google_search', 'google_maps', 'google_local']);

/** Poll interval for checking single scan completion (ms) */
const POLL_INTERVAL_MS = 5000;
/** Poll interval for checking full scan batch completion (ms) */
const BATCH_POLL_INTERVAL_MS = 15000;
/** Maximum time to wait for a single scan to finish (ms) — 30 minutes */
const SCAN_TIMEOUT_MS = 30 * 60 * 1000;
/** Maximum time to wait for a full scan batch to finish (ms) — 6 hours */
const FULL_SCAN_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/**
 * Coordinates full scan runs.
 * Creates scan records, generates grid points, queues tasks,
 * and processes results through BusinessMatcher.
 */
export class ScanOrchestrator {
  private readonly queue: ScanQueue;
  private readonly matcher: BusinessMatcher;
  private readonly engines = new Map<string, BaseEngine>();

  constructor(private readonly prisma: PrismaClient) {
    this.queue = new ScanQueue();
    this.matcher = new BusinessMatcher(prisma);

    this.registerEngines();
    this.queue.setTaskHandler((task) => this.executeTask(task));
    this.queue.setGoogleLimitChecker(() => this.getGoogleDailyTotal());
  }

  private registerEngines(): void {
    // google_maps disabled — requires Playwright/Chrome which is not available on Render
    // bing_local disabled — Bing Maps renders listings via JavaScript, static HTML has no business data
    const engineConstructors: Array<() => BaseEngine> = [
      () => new BingSearchEngine(),
      () => new GoogleSearchEngine(),
      () => new GoogleLocalEngine(),
      () => new DuckDuckGoEngine(),
    ];

    for (const create of engineConstructors) {
      try {
        const engine = create();
        this.engines.set(engine.engineId, engine);
        this.queue.registerEngine(engine);
        logger.info(`[ScanOrchestrator] Registered engine: ${engine.engineName}`);
      } catch (error: unknown) {
        logger.warn(`[ScanOrchestrator] Failed to register engine: ${toErrorMessage(error)}`);
      }
    }
  }

  /**
   * Recover scans left in running/queued state after a service restart.
   * Re-queues incomplete scan points and resumes batch monitoring.
   */
  async recoverOrphanedScans(): Promise<void> {
    const orphanedScans = await this.prisma.scan.findMany({
      where: { status: { in: ['running', 'queued'] } },
      select: {
        id: true, searchEngine: true, pointsCompleted: true, pointsTotal: true, keyword: true,
        serviceArea: { select: { name: true, state: true } },
      },
    });

    if (orphanedScans.length === 0) {
      logger.info('[ScanOrchestrator] No orphaned scans to recover');
      return;
    }

    logger.info(`[ScanOrchestrator] Recovering ${orphanedScans.length} orphaned scans`);

    let totalRequeued = 0;

    for (const scan of orphanedScans) {
      // Find scan points that haven't been completed
      const pendingPoints = await this.prisma.scanPoint.findMany({
        where: { scanId: scan.id, status: { in: ['pending', 'running'] } },
        select: { id: true, gridRow: true, gridCol: true, lat: true, lng: true },
      });

      if (pendingPoints.length === 0) {
        // All points done — mark scan as completed
        await this.prisma.scan.update({
          where: { id: scan.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        continue;
      }

      // Ensure scan is marked running
      await this.prisma.scan.update({
        where: { id: scan.id },
        data: { status: 'running' },
      });

      // Re-queue incomplete points
      const tasks: ScanTask[] = pendingPoints.map((sp) => ({
        scanId: scan.id,
        scanPointId: sp.id,
        engineId: scan.searchEngine,
        query: scan.keyword,
        point: {
          row: sp.gridRow,
          col: sp.gridCol,
          lat: Number(sp.lat),
          lng: Number(sp.lng),
        },
        priority: 1,
        city: scan.serviceArea.name,
        state: scan.serviceArea.state,
      }));

      this.queue.enqueueBatch(tasks);
      totalRequeued += tasks.length;
    }

    logger.info(`[ScanOrchestrator] Re-queued ${totalRequeued} tasks from ${orphanedScans.length} scans`);

    // Start batch monitor for all recovered scans
    const scanIds = orphanedScans.map((s) => s.id);
    this.monitorFullScan(scanIds).catch((error: unknown) => {
      logger.error(`[ScanOrchestrator] Recovery monitor failed: ${toErrorMessage(error)}`);
    });
  }

  getEngine(engineId: string): BaseEngine | undefined {
    return this.engines.get(engineId);
  }

  getEngines(): Map<string, BaseEngine> {
    return this.engines;
  }

  getQueue(): ScanQueue {
    return this.queue;
  }

  /**
   * Get combined daily request count across all Google scraping engines.
   */
  getGoogleDailyTotal(): number {
    let total = 0;
    for (const engineId of GOOGLE_ENGINE_IDS) {
      const engine = this.engines.get(engineId);
      if (engine) {
        total += engine.getState().requestsToday;
      }
    }
    return total;
  }

  /**
   * Create and execute a single scan (from API).
   * Uses per-scan monitoring — fine for individual scans.
   */
  async createScan(request: CreateScanRequest): Promise<string> {
    const scanId = await this.createScanRecord(request);

    // Monitor single scan completion in background
    this.monitorScan(scanId).catch((error: unknown) => {
      logger.error(`[ScanOrchestrator] Scan monitor ${scanId} failed: ${toErrorMessage(error)}`);
    });

    return scanId;
  }

  /**
   * Create a full scan across multiple service areas, categories, keywords, and engines.
   * Returns array of scan IDs created.
   *
   * Unlike createScan(), this does NOT spawn a monitor per scan.
   * Instead, one shared monitorFullScan() loop checks all scans in a single query.
   */
  async createFullScan(request: FullScanRequest): Promise<string[]> {
    // Resolve service areas (all active if none specified)
    const serviceAreas = request.serviceAreaIds?.length
      ? await this.prisma.serviceArea.findMany({
        where: { id: { in: request.serviceAreaIds }, isActive: true },
      })
      : await this.prisma.serviceArea.findMany({ where: { isActive: true } });

    if (serviceAreas.length === 0) {
      throw new Error('No active service areas found');
    }

    // Resolve categories + keywords (all active if none specified)
    const categoryFilter = request.categoryIds?.length
      ? { id: { in: request.categoryIds }, isActive: true }
      : { isActive: true };

    const categories = await this.prisma.category.findMany({
      where: categoryFilter,
      include: { keywords: { where: { isActive: true } } },
    });

    if (categories.length === 0) {
      throw new Error('No active categories found');
    }

    // Resolve engines (all registered if none specified)
    const engineIds = request.engineIds?.length
      ? request.engineIds.filter((id) => this.engines.has(id))
      : [...this.engines.keys()];

    if (engineIds.length === 0) {
      throw new Error('No available engines');
    }

    const scanIds: string[] = [];

    // For each combination of (serviceArea x keyword x engine), create a scan record
    // No per-scan monitoring — we use a single batch monitor
    for (const area of serviceAreas) {
      for (const category of categories) {
        const keywords = category.keywords.map((kw) => kw.keyword);
        // If no keywords defined, use category name as fallback
        if (keywords.length === 0) {
          keywords.push(category.name);
        }

        for (const keyword of keywords) {
          for (const engineId of engineIds) {
            try {
              const scanId = await this.createScanRecord({
                serviceAreaId: area.id,
                categoryId: category.id,
                keyword,
                searchEngine: engineId,
                gridSize: request.gridSize,
              });
              scanIds.push(scanId);
            } catch (error: unknown) {
              logger.warn(
                `[ScanOrchestrator] Failed to create scan for area=${area.id}, keyword="${keyword}", engine=${engineId}: ${toErrorMessage(error)}`,
              );
            }
          }
        }
      }
    }

    logger.info(`[ScanOrchestrator] Full scan created ${scanIds.length} scans across ${engineIds.length} engines`);

    // Single batch monitor for all scans — one DB query every 15s instead of N queries every 5s
    if (scanIds.length > 0) {
      this.monitorFullScan(scanIds).catch((error: unknown) => {
        logger.error(`[ScanOrchestrator] Full scan monitor failed: ${toErrorMessage(error)}`);
      });
    }

    return scanIds;
  }

  /**
   * Create a scan record, generate grid points, and queue tasks.
   * Does NOT start monitoring — caller decides how to monitor.
   */
  private async createScanRecord(request: CreateScanRequest): Promise<string> {
    const serviceArea = await this.prisma.serviceArea.findUnique({
      where: { id: request.serviceAreaId },
    });
    if (!serviceArea) throw new Error(`Service area ${request.serviceAreaId} not found`);

    const category = await this.prisma.category.findUnique({
      where: { id: request.categoryId },
    });
    if (!category) throw new Error(`Category ${request.categoryId} not found`);

    const engine = this.engines.get(request.searchEngine);
    if (!engine) throw new Error(`Engine ${request.searchEngine} not available`);

    const gridSize = request.gridSize ?? 7;

    // Create scan record
    const scan = await this.prisma.scan.create({
      data: {
        serviceAreaId: serviceArea.id,
        categoryId: category.id,
        keyword: request.keyword,
        searchEngine: request.searchEngine,
        gridSize,
        radiusMiles: Number(serviceArea.radiusMiles),
        status: 'queued',
        pointsTotal: gridSize * gridSize,
        pointsCompleted: 0,
      },
    });

    // Generate grid points
    const gridPoints = generateGrid(
      Number(serviceArea.centerLat),
      Number(serviceArea.centerLng),
      Number(serviceArea.radiusMiles),
      gridSize,
    );

    // Create scan point records
    const scanPoints = await Promise.all(
      gridPoints.map((point) =>
        this.prisma.scanPoint.create({
          data: {
            scanId: scan.id,
            gridRow: point.row,
            gridCol: point.col,
            lat: point.lat,
            lng: point.lng,
            status: 'pending',
          },
        }),
      ),
    );

    // Queue tasks — enqueueBatch auto-starts processing
    const tasks: ScanTask[] = scanPoints.map((sp: { id: string }, index: number) => ({
      scanId: scan.id,
      scanPointId: sp.id,
      engineId: request.searchEngine,
      query: request.keyword,
      point: gridPoints[index],
      priority: 1,
      city: serviceArea.name,
      state: serviceArea.state,
    }));

    this.queue.enqueueBatch(tasks);

    // Mark as running
    await this.prisma.scan.update({
      where: { id: scan.id },
      data: { status: 'running', startedAt: new Date() },
    });

    return scan.id;
  }

  /**
   * Monitor a single scan (used by createScan API endpoint).
   * Polls DB every 5s, times out after 30 min.
   */
  private async monitorScan(scanId: string): Promise<void> {
    const startTime = Date.now();

    try {
      while (Date.now() - startTime < SCAN_TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS);

        const scan = await this.prisma.scan.findUnique({ where: { id: scanId } });
        if (!scan) {
          logger.warn(`[ScanOrchestrator] Scan ${scanId} not found during monitoring`);
          return;
        }

        if (scan.pointsCompleted >= scan.pointsTotal) {
          await this.prisma.scan.update({
            where: { id: scanId },
            data: { status: 'completed', completedAt: new Date() },
          });
          logger.info(`[ScanOrchestrator] Scan ${scanId} completed (${scan.pointsCompleted}/${scan.pointsTotal})`);
          return;
        }

        // Check if queue is empty and engine stopped processing
        const queueDepth = this.queue.getQueueDepth(scan.searchEngine);
        const isEngineProcessing = this.queue.getProcessingEngines().has(scan.searchEngine);
        const hasRetry = this.queue.hasRetryTimer(scan.searchEngine);

        // Don't mark as failed if a retry timer is scheduled — engine will resume
        if (queueDepth === 0 && !isEngineProcessing && !hasRetry) {
          const finalStatus = scan.pointsCompleted >= scan.pointsTotal ? 'completed' : 'failed';
          await this.prisma.scan.update({
            where: { id: scanId },
            data: {
              status: finalStatus,
              completedAt: new Date(),
              errorMessage: finalStatus === 'failed'
                ? `Only ${scan.pointsCompleted}/${scan.pointsTotal} points completed`
                : null,
            },
          });
          logger.info(`[ScanOrchestrator] Scan ${scanId} ${finalStatus} (${scan.pointsCompleted}/${scan.pointsTotal})`);
          return;
        }
      }

      // Timeout
      await this.prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'failed',
          errorMessage: 'Scan timed out after 30 minutes',
          completedAt: new Date(),
        },
      });
      logger.error(`[ScanOrchestrator] Scan ${scanId} timed out`);
    } catch (error: unknown) {
      await this.prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'failed',
          errorMessage: toErrorMessage(error),
          completedAt: new Date(),
        },
      }).catch(() => { /* ignore update failure */ });
      logger.error(`[ScanOrchestrator] Scan ${scanId} failed: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Monitor a batch of scans from createFullScan().
   * Uses a single DB query every 15s instead of per-scan polling.
   * Times out after 6 hours.
   */
  private async monitorFullScan(scanIds: string[]): Promise<void> {
    const startTime = Date.now();
    const scanIdSet = new Set(scanIds);

    logger.info(`[ScanOrchestrator] Monitoring ${scanIds.length} scans in batch`);

    try {
      while (Date.now() - startTime < FULL_SCAN_TIMEOUT_MS) {
        await sleep(BATCH_POLL_INTERVAL_MS);

        // Single query: get status of all scans that aren't yet terminal
        const activeScans = await this.prisma.scan.findMany({
          where: {
            id: { in: scanIds },
            status: { in: ['queued', 'running'] },
          },
          select: {
            id: true,
            searchEngine: true,
            pointsCompleted: true,
            pointsTotal: true,
            status: true,
          },
        });

        if (activeScans.length === 0) {
          logger.info(`[ScanOrchestrator] All ${scanIds.length} scans finished`);
          return;
        }

        // Check each active scan for completion
        const completedNow: string[] = [];
        const failedNow: string[] = [];

        for (const scan of activeScans) {
          if (scan.pointsCompleted >= scan.pointsTotal) {
            completedNow.push(scan.id);
          } else {
            // Check if engine queue is empty and not processing (and no retry scheduled)
            const queueDepth = this.queue.getQueueDepth(scan.searchEngine);
            const isEngineProcessing = this.queue.getProcessingEngines().has(scan.searchEngine);
            const hasRetry = this.queue.hasRetryTimer(scan.searchEngine);

            if (queueDepth === 0 && !isEngineProcessing && !hasRetry) {
              failedNow.push(scan.id);
            }
          }
        }

        // Batch update completed scans
        if (completedNow.length > 0) {
          await this.prisma.scan.updateMany({
            where: { id: { in: completedNow } },
            data: { status: 'completed', completedAt: new Date() },
          });
          logger.info(`[ScanOrchestrator] ${completedNow.length} scans completed`);
        }

        // Batch update failed scans (queue empty, points incomplete)
        if (failedNow.length > 0) {
          await this.prisma.scan.updateMany({
            where: { id: { in: failedNow } },
            data: {
              status: 'failed',
              completedAt: new Date(),
              errorMessage: 'Engine queue empty before all points completed',
            },
          });
          logger.info(`[ScanOrchestrator] ${failedNow.length} scans failed (queue empty)`);
        }

        // Remove resolved scans from tracking
        for (const id of [...completedNow, ...failedNow]) {
          scanIdSet.delete(id);
        }

        const remaining = activeScans.length - completedNow.length - failedNow.length;
        logger.info(
          `[ScanOrchestrator] Batch progress: ${remaining} active, ${scanIds.length - scanIdSet.size} resolved`,
        );
      }

      // Timeout — mark remaining active scans as failed
      const timedOut = await this.prisma.scan.updateMany({
        where: {
          id: { in: [...scanIdSet] },
          status: { in: ['queued', 'running'] },
        },
        data: {
          status: 'failed',
          errorMessage: 'Full scan timed out after 6 hours',
          completedAt: new Date(),
        },
      });

      if (timedOut.count > 0) {
        logger.error(`[ScanOrchestrator] Full scan timed out — ${timedOut.count} scans marked failed`);
      }
    } catch (error: unknown) {
      logger.error(`[ScanOrchestrator] Full scan monitor error: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Execute a single scan task: search at a grid point, match businesses, record rankings.
   */
  private async executeTask(task: ScanTask): Promise<void> {
    const engine = this.engines.get(task.engineId);
    if (!engine) throw new Error(`Engine ${task.engineId} not found`);

    try {
      const result = await engine.search(task.query, task.point, task.city, task.state);

      // Get the scan to find categoryId
      const scan = await this.prisma.scan.findUnique({ where: { id: task.scanId } });

      // Match/create businesses and record rankings
      for (const biz of result.businesses) {
        await this.processBusinessResult(task, biz, scan?.categoryId);
      }

      // Mark scan point as completed
      await this.prisma.scanPoint.update({
        where: { id: task.scanPointId },
        data: { status: 'completed' },
      });

      // Increment completed count
      await this.prisma.scan.update({
        where: { id: task.scanId },
        data: { pointsCompleted: { increment: 1 } },
      });
    } catch (error: unknown) {
      await this.prisma.scanPoint.update({
        where: { id: task.scanPointId },
        data: { status: 'failed' },
      });

      // Count failed points as completed for progress tracking
      await this.prisma.scan.update({
        where: { id: task.scanId },
        data: { pointsCompleted: { increment: 1 } },
      });

      logger.error(
        `[ScanOrchestrator] Task failed at (${task.point.row},${task.point.col}): ${toErrorMessage(error)}`,
      );
    }
  }

  private async processBusinessResult(
    task: ScanTask,
    parsed: ParsedBusiness,
    categoryId?: string | null,
  ): Promise<void> {
    const match = await this.matcher.findOrCreate(parsed, task.engineId, categoryId ?? undefined);

    // Create ranking record
    await this.prisma.scanRanking.create({
      data: {
        scanPointId: task.scanPointId,
        businessId: match.businessId,
        rankPosition: parsed.rankPosition,
        resultType: parsed.resultType,
        snippet: parsed.snippet ?? null,
      },
    });

    // Create review snapshot if rating data available
    if (parsed.rating !== undefined && parsed.reviewCount !== undefined) {
      const source = task.engineId.startsWith('bing') ? 'bing' : 'google';
      await this.prisma.reviewSnapshot.create({
        data: {
          businessId: match.businessId,
          source,
          rating: parsed.rating,
          reviewCount: parsed.reviewCount,
        },
      });
    }
  }
}
