import type { PrismaClient } from '../../generated/prisma/client/index.js';
import { ScanQueue } from './ScanQueue.js';
import { BingSearchEngine } from '../engines/BingSearchEngine.js';
import { GoogleSearchEngine } from '../engines/GoogleSearchEngine.js';
import { GoogleMapsEngine } from '../engines/GoogleMapsEngine.js';
import { GoogleLocalEngine } from '../engines/GoogleLocalEngine.js';
import { BingLocalEngine } from '../engines/BingLocalEngine.js';
import { DuckDuckGoEngine } from '../engines/DuckDuckGoEngine.js';
import { BusinessMatcher } from '../business/BusinessMatcher.js';
import { generateGrid } from '../grid/gridGenerator.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { BaseEngine } from '../engines/BaseEngine.js';
import type { ScanTask, CreateScanRequest, FullScanRequest } from '../../types/scan.types.js';
import type { ParsedBusiness } from '../../types/engine.types.js';

const GOOGLE_ENGINE_IDS = new Set(['google_search', 'google_maps', 'google_local']);

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
    const engineConstructors: Array<() => BaseEngine> = [
      () => new BingSearchEngine(),
      () => new GoogleSearchEngine(),
      () => new GoogleMapsEngine(),
      () => new GoogleLocalEngine(),
      () => new BingLocalEngine(),
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
   * Create and execute a single scan.
   */
  async createScan(request: CreateScanRequest): Promise<string> {
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

    // Queue tasks
    const tasks: ScanTask[] = scanPoints.map((sp: { id: string }, index: number) => ({
      scanId: scan.id,
      scanPointId: sp.id,
      engineId: request.searchEngine,
      query: request.keyword,
      point: gridPoints[index],
      priority: 1,
    }));

    this.queue.enqueueBatch(tasks);

    // Start processing in background
    this.processScan(scan.id).catch((error: unknown) => {
      logger.error(`[ScanOrchestrator] Scan ${scan.id} failed: ${toErrorMessage(error)}`);
    });

    return scan.id;
  }

  /**
   * Create a full scan across multiple service areas, categories, keywords, and engines.
   * Returns array of scan IDs created.
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

    // For each combination of (serviceArea x keyword x engine), create a scan
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
              const scanId = await this.createScan({
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

    logger.info(`[ScanOrchestrator] Full scan created ${scanIds.length} scans`);
    return scanIds;
  }

  private async processScan(scanId: string): Promise<void> {
    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      await this.queue.processAll();

      const scan = await this.prisma.scan.findUnique({ where: { id: scanId } });
      const finalStatus = scan?.pointsCompleted === scan?.pointsTotal ? 'completed' : 'failed';

      await this.prisma.scan.update({
        where: { id: scanId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
        },
      });

      logger.info(`[ScanOrchestrator] Scan ${scanId} ${finalStatus}`);
    } catch (error: unknown) {
      await this.prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'failed',
          errorMessage: toErrorMessage(error),
          completedAt: new Date(),
        },
      });
      logger.error(`[ScanOrchestrator] Scan ${scanId} failed: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Execute a single scan task: search at a grid point, match businesses, record rankings.
   */
  private async executeTask(task: ScanTask): Promise<void> {
    const engine = this.engines.get(task.engineId);
    if (!engine) throw new Error(`Engine ${task.engineId} not found`);

    try {
      const result = await engine.search(task.query, task.point);

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
