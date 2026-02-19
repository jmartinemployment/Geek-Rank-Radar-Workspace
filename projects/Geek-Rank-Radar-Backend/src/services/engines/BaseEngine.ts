import type { EngineConfig, ThrottleConfig } from '../../config/engines.js';
import type { GeoPoint, SERPResult, EngineStatus } from '../../types/engine.types.js';
import { getRandomUserAgent, buildBrowserHeaders } from '../../utils/userAgents.js';
import { humanDelay, sleep } from '../../utils/delay.js';
import { logger } from '../../config/logger.js';

export interface EngineState {
  status: EngineStatus;
  requestsThisHour: number;
  requestsToday: number;
  lastRequestAt: Date | null;
  blockedUntil: Date | null;
  errorCount: number;
  hourResetAt: number;
  dayResetAt: number;
}

/**
 * Abstract base class for all search engines.
 * Handles throttling, user agent rotation, delay, and CAPTCHA detection.
 */
export abstract class BaseEngine {
  abstract readonly engineId: string;
  abstract readonly engineName: string;

  protected readonly config: EngineConfig;
  protected readonly throttle: ThrottleConfig;
  protected state: EngineState;

  constructor(config: EngineConfig) {
    this.config = config;
    this.throttle = config.throttle;

    const now = Date.now();
    this.state = {
      status: 'healthy',
      requestsThisHour: 0,
      requestsToday: 0,
      lastRequestAt: null,
      blockedUntil: null,
      errorCount: 0,
      hourResetAt: now + 3_600_000,
      dayResetAt: this.getNextMidnightUTC(),
    };
  }

  abstract search(query: string, location: GeoPoint): Promise<SERPResult>;

  getState(): EngineState {
    this.refreshBuckets();
    return { ...this.state };
  }

  getStatus(): EngineStatus {
    this.refreshBuckets();

    if (this.state.blockedUntil && Date.now() < this.state.blockedUntil.getTime()) {
      return 'blocked';
    }

    if (
      this.state.requestsThisHour >= this.throttle.maxPerHour ||
      this.state.requestsToday >= this.throttle.maxPerDay
    ) {
      return 'throttled';
    }

    return 'healthy';
  }

  canMakeRequest(): boolean {
    return this.getStatus() === 'healthy';
  }

  /**
   * Wait the appropriate delay before making the next request.
   */
  protected async waitForThrottle(): Promise<void> {
    const delay = humanDelay(
      this.throttle.minDelayMs,
      this.throttle.maxDelayMs,
      this.throttle.jitterMs,
    );
    logger.debug(`[${this.engineId}] Waiting ${delay}ms before request`);
    await sleep(delay);
  }

  /**
   * Record a successful request.
   */
  protected recordRequest(): void {
    this.refreshBuckets();
    this.state.requestsThisHour++;
    this.state.requestsToday++;
    this.state.lastRequestAt = new Date();
    this.state.errorCount = 0;
  }

  /**
   * Record an error and apply backoff.
   */
  protected recordError(): void {
    this.state.errorCount++;
  }

  /**
   * Mark engine as blocked (e.g., CAPTCHA detected).
   */
  protected markBlocked(): void {
    const pauseMs = this.throttle.pauseOnCaptchaHours * 3_600_000;
    this.state.blockedUntil = new Date(Date.now() + pauseMs);
    this.state.status = 'blocked';
    logger.warn(
      `[${this.engineId}] Blocked until ${this.state.blockedUntil.toISOString()}`,
    );
  }

  protected getRandomUserAgent(): string {
    return getRandomUserAgent();
  }

  protected buildHeaders(): Record<string, string> {
    return buildBrowserHeaders();
  }

  /**
   * Detect CAPTCHA / bot detection in response body (Google-specific).
   */
  protected detectCaptcha(body: string): boolean {
    const captchaPatterns = [
      'unusual traffic',
      'captcha',
      'Our systems have detected',
      'sorry/index',
      'recaptcha',
    ];
    const lowerBody = body.toLowerCase();
    return captchaPatterns.some((pattern) => lowerBody.includes(pattern.toLowerCase()));
  }

  private refreshBuckets(): void {
    const now = Date.now();

    if (now >= this.state.hourResetAt) {
      this.state.requestsThisHour = 0;
      this.state.hourResetAt = now + 3_600_000;
    }

    if (now >= this.state.dayResetAt) {
      this.state.requestsToday = 0;
      this.state.dayResetAt = this.getNextMidnightUTC();
    }

    if (this.state.blockedUntil && now >= this.state.blockedUntil.getTime()) {
      this.state.blockedUntil = null;
      this.state.status = 'healthy';
      logger.info(`[${this.engineId}] Block expired, resuming`);
    }
  }

  private getNextMidnightUTC(): number {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ));
    return tomorrow.getTime();
  }
}
