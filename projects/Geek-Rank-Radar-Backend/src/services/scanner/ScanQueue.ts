import { GOOGLE_COMBINED_DAILY_LIMIT } from '../../config/engines.js';
import type { ScanTask } from '../../types/scan.types.js';
import type { BaseEngine } from '../engines/BaseEngine.js';
import { logger } from '../../config/logger.js';

const GOOGLE_ENGINE_IDS = new Set(['google_search', 'google_maps', 'google_local']);

/**
 * Event-driven priority queue with per-engine processing.
 * Each engine processes its own queue independently — enqueueing
 * tasks automatically starts processing for the relevant engines.
 */
export class ScanQueue {
  private readonly queues = new Map<string, ScanTask[]>();
  private readonly engines = new Map<string, BaseEngine>();
  private readonly processingEngines = new Set<string>();
  private stopped = false;
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
    this.ensureProcessing();
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
   * Ensure all engines with queued tasks are processing.
   * Idempotent — safe to call multiple times. Only starts engines
   * that aren't already running.
   */
  ensureProcessing(): void {
    this.stopped = false;
    for (const [engineId, queue] of this.queues.entries()) {
      if (queue.length > 0 && !this.processingEngines.has(engineId)) {
        this.processingEngines.add(engineId);
        this.processEngine(engineId).catch((error: unknown) => {
          logger.error(
            `[ScanQueue] Engine ${engineId} processing error: ${error instanceof Error ? error.message : String(error)}`,
          );
          this.processingEngines.delete(engineId);
        });
      }
    }
  }

  stop(): void {
    this.stopped = true;
    for (const [engineId, queue] of this.queues.entries()) {
      logger.info(`[ScanQueue] Clearing ${queue.length} tasks for ${engineId}`);
      queue.length = 0;
    }
    this.processingEngines.clear();
  }

  isProcessing(): boolean {
    return this.processingEngines.size > 0;
  }

  getProcessingEngines(): ReadonlySet<string> {
    return this.processingEngines;
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

    if (!queue || !engine) {
      this.processingEngines.delete(engineId);
      return;
    }

    logger.info(`[ScanQueue] Started processing engine ${engineId} (${queue.length} tasks)`);

    while (queue.length > 0 && !this.stopped) {
      if (!engine.canMakeRequest()) {
        logger.warn(`[ScanQueue] Engine ${engineId} is ${engine.getStatus()}, pausing queue`);
        break;
      }

      if (this.isGoogleEngine(engineId) && this.isGoogleLimitReached()) {
        logger.warn(
          `[ScanQueue] Google combined daily limit (${GOOGLE_COMBINED_DAILY_LIMIT}) reached, pausing ${engineId}`,
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

    this.processingEngines.delete(engineId);
    logger.info(`[ScanQueue] Engine ${engineId} done (${queue.length} remaining)`);
  }
}
