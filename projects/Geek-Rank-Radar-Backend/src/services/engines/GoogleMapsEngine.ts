import { chromium, type Browser, type Page } from 'playwright-core';
import { accessSync } from 'node:fs';
import { BaseEngine } from './BaseEngine.js';
import { GoogleMapsParser } from '../parsers/GoogleMapsParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { getCurrentProfile } from '../../utils/userAgents.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult, ParsedBusiness } from '../../types/engine.types.js';

/** Max time to wait for Maps results to render (ms) */
const NAVIGATION_TIMEOUT = 20000;
/** Selector for Google Maps business result items */
const RESULT_SELECTOR = 'div[role="feed"] > div > div > a[href*="/maps/place/"]';
/** Fallback selector if feed-based selector fails */
const FALLBACK_SELECTOR = 'a.hfpxzc';

/**
 * Google Maps scraping engine using Playwright for JS-rendered content.
 * Google Maps is a SPA — HTTP-only requests return an empty shell.
 * This engine launches a headless browser to wait for business cards to render.
 */
export class GoogleMapsEngine extends BaseEngine {
  readonly engineId = 'google_maps';
  readonly engineName = 'Google Maps';

  private readonly htmlParser = new GoogleMapsParser();
  private browser: Browser | null = null;

  constructor() {
    super(ENGINE_CONFIGS.google_maps);
  }

  async search(query: string, location: GeoPoint): Promise<SERPResult> {
    if (!this.canMakeRequest()) {
      throw new Error(`Google Maps is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.google.com/maps/search/${encodedQuery}/@${location.lat},${location.lng},13z`;

    try {
      const businesses = await this.scrapeWithPlaywright(url);

      if (businesses.length === 0) {
        // Fallback: try the HTTP parser in case Playwright isn't available
        return this.httpFallback(query, location, startTime);
      }

      this.recordRequest();

      const responseTimeMs = Date.now() - startTime;

      logger.info(
        `[${this.engineId}] Search for "${query}" returned ${businesses.length} businesses (Playwright)`,
      );

      return {
        engineId: this.engineId,
        query,
        location,
        timestamp: new Date(),
        businesses,
        organicResults: [],
        metadata: {
          captchaDetected: false,
          responseTimeMs,
          parserVersion: 'playwright-2026-02-19',
        },
      };
    } catch (error: unknown) {
      this.recordError();
      logger.error(`[${this.engineId}] Playwright search failed: ${toErrorMessage(error)}`);

      // Fallback to HTTP parser
      try {
        return await this.httpFallback(query, location, startTime);
      } catch {
        throw error;
      }
    }
  }

  private async scrapeWithPlaywright(url: string): Promise<ParsedBusiness[]> {
    const page = await this.getPage();
    if (!page) return [];

    try {
      // Set realistic viewport
      await page.setViewportSize({ width: 1366, height: 768 });

      // Override navigator.webdriver to avoid detection
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      // Navigate to Maps search
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });

      // Wait for results to render (business cards in the sidebar)
      const resultSelector = await this.waitForResults(page);
      if (!resultSelector) {
        // Check for CAPTCHA
        const content = await page.content();
        if (this.detectCaptcha(content)) {
          this.markBlocked();
          return [];
        }
        logger.debug(`[${this.engineId}] No results found after waiting`);
        return [];
      }

      // Extract business data from rendered DOM
      // The evaluate callback runs in the browser context (DOM APIs available)
      const businesses = await page.evaluate(`
        (() => {
          const results = [];
          const elements = document.querySelectorAll('${resultSelector.replaceAll("'", "\\'")}');

          for (const el of elements) {
            const ariaLabel = el.getAttribute('aria-label') || '';
            if (!ariaLabel) continue;

            const name = ariaLabel;
            const container = el.closest('div');
            if (!container) continue;

            const text = container.textContent || '';

            const ratingMatch = /(\\d\\.\\d)\\s*\\(/.exec(text);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

            const reviewMatch = /\\(([\\d,]+)\\)/.exec(text);
            const reviewCount = reviewMatch
              ? parseInt(reviewMatch[1].replaceAll(',', ''), 10)
              : undefined;

            const mapsUrl = el.href;

            results.push({ name, rating, reviewCount, mapsUrl });
          }

          return results;
        })()
      `) as Array<{
        name: string;
        rating?: number;
        reviewCount?: number;
        mapsUrl?: string;
      }>;

      // Convert to ParsedBusiness
      return businesses.map((biz, index) => ({
        name: biz.name,
        rating: biz.rating && biz.rating > 0 && biz.rating <= 5 ? biz.rating : undefined,
        reviewCount: biz.reviewCount && biz.reviewCount > 0 ? biz.reviewCount : undefined,
        googleMapsUrl: biz.mapsUrl,
        resultType: 'maps' as const,
        rankPosition: index + 1,
      }));
    } finally {
      // Don't close the page — reuse it for the next request
      // But navigate away to prevent stale state
      await page.goto('about:blank').catch(() => {});
    }
  }

  private async waitForResults(page: Page): Promise<string | null> {
    // Try primary selector first, then fallback
    for (const selector of [RESULT_SELECTOR, FALLBACK_SELECTOR]) {
      try {
        await page.waitForSelector(selector, { timeout: 8000 });
        return selector;
      } catch {
        // Try next selector
      }
    }
    return null;
  }

  private async getPage(): Promise<Page | null> {
    try {
      if (!this.browser || !this.browser.isConnected()) {
        // Try to find a Chrome/Chromium executable
        const executablePath = this.findChromePath();
        if (!executablePath) {
          logger.warn(`[${this.engineId}] No Chrome/Chromium found — Playwright disabled`);
          return null;
        }

        this.browser = await chromium.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
          ],
        });
      }

      const context = this.browser.contexts().at(0) ?? await this.browser.newContext({
        userAgent: getCurrentProfile().userAgent,
        locale: 'en-US',
        geolocation: undefined,
        permissions: [],
      });

      return context.pages().at(0) ?? await context.newPage();
    } catch (error: unknown) {
      logger.warn(`[${this.engineId}] Failed to launch browser: ${toErrorMessage(error)}`);
      return null;
    }
  }

  private findChromePath(): string | undefined {
    // Check environment variable first
    const envPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? process.env.CHROME_PATH;
    if (envPath) return envPath;

    // Common Chrome/Chromium paths by platform
    const paths: Record<string, string[]> = {
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ],
      linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
      ],
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ],
    };

    const candidates = paths[process.platform] ?? [];
    for (const p of candidates) {
      try {
        accessSync(p);
        return p;
      } catch {
        // Not found, try next
      }
    }

    return undefined;
  }

  /**
   * HTTP fallback when Playwright isn't available.
   * Uses the HTML parser which may extract limited data from the SPA shell.
   */
  private async httpFallback(query: string, location: GeoPoint, startTime: number): Promise<SERPResult> {
    const { default: axios } = await import('axios');
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.google.com/maps/search/${encodedQuery}/@${location.lat},${location.lng},13z`;

    const response = await axios.get(url, {
      headers: this.buildHeaders('www.google.com'),
      timeout: 15000,
      responseType: 'text',
      ...this.getProxyConfig(),
    });

    this.storeCookies('google.com', response.headers['set-cookie']);
    const html = response.data as string;

    if (this.detectCaptcha(html)) {
      this.markBlocked();
      return {
        engineId: this.engineId,
        query,
        location,
        timestamp: new Date(),
        businesses: [],
        organicResults: [],
        metadata: { captchaDetected: true, responseTimeMs: Date.now() - startTime },
      };
    }

    this.recordRequest();

    const responseTimeMs = Date.now() - startTime;
    const result = this.htmlParser.parse(html, query, location, responseTimeMs);

    logger.info(
      `[${this.engineId}] HTTP fallback for "${query}" returned ${result.businesses.length} businesses`,
    );

    return result;
  }

  /**
   * Clean up browser on shutdown.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
