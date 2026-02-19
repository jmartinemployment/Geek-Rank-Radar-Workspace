import { GOOGLE_COMBINED_DAILY_LIMIT } from '../../config/engines.js';
import type { ScanTask } from '../../types/scan.types.js';
import type { BaseEngine } from '../engines/BaseEngine.js';
import { logger } from '../../config/logger.js';

const GOOGLE_ENGINE_IDS = new Set(['google_search', 'google_maps', 'google_local']);

/**
 * Priority queue with per-engine throttling.
 * Tasks are sorted by priority (higher first).
 */
export class ScanQueue {
  private readonly queues = new Map<string, ScanTask[]>();
  private readonly engines = new Map<string, BaseEngine>();
  private processing = false;
  private onTaskComplete?: (task: ScanTask) => Promise<void>;
  private googleLimitChecker?: () => number;

  registerEngine(engine: BaseEngine): void {
    this.engines.set(engine.engineId, engine);
    this.queues.set(engine.engineId, []);
  }

  enqueue(task: ScanTask): void {
    const queue = this.queues.get(task.engineId);
    if (!queue) {
      logger.warn(`[ScanQueue] No queue for engine ${task.engineId}`);
      return;
    }
    queue.push(task);
    queue.sort((a, b) => b.priority - a.priority);
  }

  enqueueBatch(tasks: ScanTask[]): void {
    for (const task of tasks) {
      this.enqueue(task);
    }
  }

  setTaskHandler(handler: (task: ScanTask) => Promise<void>): void {
    this.onTaskComplete = handler;
  }

  /**
   * Set a callback that returns the combined Google daily request count.
   * Used to enforce GOOGLE_COMBINED_DAILY_LIMIT across all Google engines.
   */
  setGoogleLimitChecker(checker: () => number): void {
    this.googleLimitChecker = checker;
  }

  getQueueDepth(engineId: string): number {
    return this.queues.get(engineId)?.length ?? 0;
  }

  getTotalDepth(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Start processing all engine queues in parallel.
   * Each engine processes sequentially with its own throttle.
   */
  async processAll(): Promise<void> {
    if (this.processing) {
      logger.warn('[ScanQueue] Already processing');
      return;
    }
    this.processing = true;

    const promises: Promise<void>[] = [];
    for (const engineId of this.queues.keys()) {
      promises.push(this.processEngine(engineId));
    }

    await Promise.allSettled(promises);
    this.processing = false;
  }

  stop(): void {
    this.processing = false;
    for (const [engineId, queue] of this.queues.entries()) {
      logger.info(`[ScanQueue] Clearing ${queue.length} tasks for ${engineId}`);
      queue.length = 0;
    }
  }

  isProcessing(): boolean {
    return this.processing;
  }

  private isGoogleEngine(engineId: string): boolean {
    return GOOGLE_ENGINE_IDS.has(engineId);
  }

  private isGoogleLimitReached(): boolean {
    if (!this.googleLimitChecker) return false;
    return this.googleLimitChecker() >= GOOGLE_COMBINED_DAILY_LIMIT;
  }

  private async processEngine(engineId: string): Promise<void> {
    const queue = this.queues.get(engineId);
    const engine = this.engines.get(engineId);

    if (!queue || !engine) return;

    logger.info(`[ScanQueue] Processing ${queue.length} tasks for ${engineId}`);

    while (queue.length > 0 && this.processing) {
      if (!engine.canMakeRequest()) {
        logger.warn(`[ScanQueue] Engine ${engineId} is ${engine.getStatus()}, stopping queue`);
        break;
      }

      // Check combined Google daily limit before processing a Google engine task
      if (this.isGoogleEngine(engineId) && this.isGoogleLimitReached()) {
        logger.warn(
          `[ScanQueue] Google combined daily limit (${GOOGLE_COMBINED_DAILY_LIMIT}) reached, stopping ${engineId} queue`,
        );
        break;
      }

      const task = queue.shift();
      if (!task) break;

      try {
        if (this.onTaskComplete) {
          await this.onTaskComplete(task);
        }
      } catch (error: unknown) {
        logger.error(
          `[ScanQueue] Task failed for ${engineId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    logger.info(`[ScanQueue] Engine ${engineId} queue complete (${queue.length} remaining)`);
  }
}
