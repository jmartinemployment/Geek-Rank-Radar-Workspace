import { GOOGLE_COMBINED_DAILY_LIMIT } from '../../config/engines.js';
import type { ScanTask } from '../../types/scan.types.js';
import type { BaseEngine } from '../engines/BaseEngine.js';
import { logger } from '../../config/logger.js';

/** How long to wait before retrying a throttled/blocked engine (ms) */
const RETRY_THROTTLED_MS = 60_000;

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
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  isProcessing(): boolean {
    return this.processingEngines.size > 0;
  }

  getProcessingEngines(): ReadonlySet<string> {
    return this.processingEngines;
  }

  /**
   * Check if an engine has a retry timer scheduled (blocked/throttled but will retry).
   */
  hasRetryTimer(engineId: string): boolean {
    return this.retryTimers.has(engineId);
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

    let pausedReason = '';

    while (queue.length > 0 && !this.stopped) {
      if (!engine.canMakeRequest()) {
        pausedReason = engine.getStatus();
        logger.warn(`[ScanQueue] Engine ${engineId} is ${pausedReason}, pausing queue`);
        break;
      }

      if (this.isGoogleEngine(engineId) && this.isGoogleLimitReached()) {
        pausedReason = 'google_daily_limit';
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

    // If paused due to throttle/block and tasks remain, schedule retry
    if (pausedReason && queue.length > 0 && !this.stopped) {
      this.scheduleRetry(engineId);
    }

    logger.info(`[ScanQueue] Engine ${engineId} done (${queue.length} remaining${pausedReason ? `, paused: ${pausedReason}` : ''})`);
  }

  /**
   * Schedule a retry for a paused engine.
   * Checks again in 60s if the engine can resume processing.
   */
  private scheduleRetry(engineId: string): void {
    // Don't stack multiple retries for the same engine
    if (this.retryTimers.has(engineId)) return;

    logger.info(`[ScanQueue] Scheduling retry for ${engineId} in ${RETRY_THROTTLED_MS / 1000}s`);

    const timer = setTimeout(() => {
      this.retryTimers.delete(engineId);
      const queue = this.queues.get(engineId);
      if (queue && queue.length > 0 && !this.stopped) {
        logger.info(`[ScanQueue] Retrying engine ${engineId} (${queue.length} tasks queued)`);
        this.ensureProcessing();
      }
    }, RETRY_THROTTLED_MS);

    this.retryTimers.set(engineId, timer);
  }
}
