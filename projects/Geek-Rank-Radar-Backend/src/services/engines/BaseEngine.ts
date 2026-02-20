import type { EngineConfig, ThrottleConfig } from '../../config/engines.js';
import type { GeoPoint, SERPResult, EngineStatus } from '../../types/engine.types.js';
import { buildStealthHeaders, trackRequest, rotateProfile } from '../../utils/userAgents.js';
import { humanDelay, sleep } from '../../utils/delay.js';
import { CookieJar } from '../../utils/cookies.js';
import { ProxyRotator } from '../../utils/proxy.js';
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

/** Shared proxy rotator singleton (all engines share the same pool) */
let sharedProxyRotator: ProxyRotator | undefined;

function getProxyRotator(): ProxyRotator {
  if (!sharedProxyRotator) {
    sharedProxyRotator = new ProxyRotator();
  }
  return sharedProxyRotator;
}

/** Maximum backoff delay in milliseconds (5 minutes) */
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Number of requests before rotating user agent profile */
const SESSION_ROTATION_INTERVAL = 20;

/**
 * Abstract base class for all search engines.
 * Handles throttling, stealth headers, proxy rotation, cookie persistence,
 * adaptive backoff, and CAPTCHA detection with graduated response.
 */
export abstract class BaseEngine {
  abstract readonly engineId: string;
  abstract readonly engineName: string;

  protected readonly config: EngineConfig;
  protected readonly throttle: ThrottleConfig;
  protected state: EngineState;
  protected readonly cookieJar = new CookieJar();
  private captchaCount = 0;
  private captchaWindowStart = 0;
  private requestCount = 0;

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

  abstract search(query: string, location: GeoPoint, city?: string, state?: string): Promise<SERPResult>;

  getState(): EngineState {
    this.refreshBuckets();
    return { ...this.state };
  }

  /**
   * Manually clear a block (e.g., admin reset after IP change or proxy added).
   * Resets CAPTCHA counter and error count.
   */
  clearBlock(): void {
    this.state.blockedUntil = null;
    this.state.status = 'healthy';
    this.state.errorCount = 0;
    this.captchaCount = 0;
    this.captchaWindowStart = 0;
    rotateProfile();
    logger.info(`[${this.engineId}] Block manually cleared`);
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
   * Applies exponential backoff on errors and ±30% random timing variation.
   */
  protected async waitForThrottle(): Promise<void> {
    let baseDelay = humanDelay(
      this.throttle.minDelayMs,
      this.throttle.maxDelayMs,
      this.throttle.jitterMs,
    );

    // Exponential backoff on errors: delay * 2^errorCount
    if (this.state.errorCount > 0) {
      const backoffMultiplier = Math.pow(2, this.state.errorCount);
      baseDelay = Math.min(baseDelay * backoffMultiplier, MAX_BACKOFF_MS);
    }

    // Add ±30% random timing variation to prevent periodic patterns
    const variation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
    const finalDelay = Math.round(baseDelay * variation);

    logger.debug(`[${this.engineId}] Waiting ${finalDelay}ms before request (errors: ${this.state.errorCount})`);
    await sleep(finalDelay);
  }

  /**
   * Record a successful request.
   * Resets error count and tracks for session rotation.
   */
  protected recordRequest(): void {
    this.refreshBuckets();
    this.state.requestsThisHour++;
    this.state.requestsToday++;
    this.state.lastRequestAt = new Date();
    this.state.errorCount = 0;

    // Session rotation: rotate UA profile after N requests
    this.requestCount++;
    trackRequest(SESSION_ROTATION_INTERVAL);
  }

  /**
   * Record an error and increment backoff counter.
   */
  protected recordError(): void {
    this.state.errorCount++;
  }

  /**
   * Mark engine as blocked with graduated CAPTCHA response.
   * 1st CAPTCHA: 15 min pause
   * 2nd CAPTCHA within 24h: 2 hour pause
   * 3rd+ CAPTCHA within 24h: 24 hour pause
   */
  protected markBlocked(): void {
    const now = Date.now();

    // Reset CAPTCHA window after 24 hours
    if (now - this.captchaWindowStart > 24 * 3_600_000) {
      this.captchaCount = 0;
      this.captchaWindowStart = now;
    }

    if (this.captchaWindowStart === 0) {
      this.captchaWindowStart = now;
    }

    this.captchaCount++;

    let pauseMs: number;
    if (this.captchaCount === 1) {
      pauseMs = 15 * 60 * 1000; // 15 minutes
    } else if (this.captchaCount === 2) {
      pauseMs = 2 * 3_600_000; // 2 hours
    } else {
      pauseMs = 24 * 3_600_000; // 24 hours
    }

    this.state.blockedUntil = new Date(now + pauseMs);
    this.state.status = 'blocked';

    // Rotate profile on CAPTCHA to get a fresh fingerprint
    rotateProfile();

    const pauseDesc = pauseMs < 3_600_000
      ? `${Math.round(pauseMs / 60000)} minutes`
      : `${Math.round(pauseMs / 3_600_000)} hours`;

    logger.warn(
      `[${this.engineId}] CAPTCHA #${this.captchaCount} in 24h window — pausing ${pauseDesc} until ${this.state.blockedUntil.toISOString()}`,
    );
  }

  /**
   * Build stealth headers with engine-specific fingerprinting.
   * Includes consistent UA + Client Hints, Referer, and stored cookies.
   */
  protected buildHeaders(domain?: string): Record<string, string> {
    const headers = buildStealthHeaders(this.engineId);

    // Add stored cookies for the domain
    if (domain) {
      const cookieHeader = this.cookieJar.getCookieHeader(domain);
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }
    }

    return headers;
  }

  /**
   * Store response cookies for session persistence.
   */
  protected storeCookies(domain: string, setCookieHeader: string | string[] | undefined): void {
    this.cookieJar.setCookies(domain, setCookieHeader);
  }

  /**
   * Get proxy config for axios requests.
   */
  protected getProxyConfig(): Record<string, unknown> {
    const rotator = getProxyRotator();
    if (!rotator.hasProxies) return {};
    return rotator.getAxiosConfig();
  }

  /**
   * Mark a proxy as failed.
   */
  protected markProxyFailed(proxyUrl: string): void {
    getProxyRotator().markFailed(proxyUrl);
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
