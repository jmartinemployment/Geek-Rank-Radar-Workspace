import axios from 'axios';
import { BaseEngine } from './BaseEngine.js';
import { BingLocalParser } from '../parsers/BingLocalParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult } from '../../types/engine.types.js';

/**
 * Bing Local / Maps scraping engine.
 * Scrapes Bing Maps HTML for business listings (no API key needed).
 */
export class BingLocalEngine extends BaseEngine {
  readonly engineId = 'bing_local';
  readonly engineName = 'Bing Local / Places';

  private readonly parser = new BingLocalParser();

  constructor() {
    super(ENGINE_CONFIGS.bing_local);
  }

  async search(query: string, location: GeoPoint, city?: string, state?: string): Promise<SERPResult> {
    if (!this.canMakeRequest()) {
      throw new Error(`Bing Local is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();
    // Use city/state for location if available (more reliable than raw lat/lng)
    const locationStr = city && state ? `${city}, ${state}` : `${location.lat},${location.lng}`;
    const encodedQuery = encodeURIComponent(query);
    const encodedLocation = encodeURIComponent(locationStr);
    const url = `https://www.bing.com/maps?q=${encodedQuery}&where1=${encodedLocation}`;

    try {
      // Try Bing Maps first
      let response = await axios.get(url, {
        headers: this.buildHeaders('www.bing.com'),
        timeout: 15000,
        responseType: 'text',
        ...this.getProxyConfig(),
      });

      this.storeCookies('bing.com', response.headers['set-cookie']);
      let html = response.data as string;

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

      let responseTimeMs = Date.now() - startTime;
      let result = this.parser.parse(html, query, location, responseTimeMs);

      // Fallback: if Maps returned 0 results, try Bing web search with local intent
      if (result.businesses.length === 0) {
        logger.warn(`[${this.engineId}] Maps returned 0 results, trying Bing web search fallback`);
        const localQuery = city && state
          ? `${query} near ${city}, ${state}`
          : `${query} near ${location.lat},${location.lng}`;
        const fallbackUrl = `https://www.bing.com/search?q=${encodeURIComponent(localQuery)}&count=20`;

        const fallbackStart = Date.now();
        response = await axios.get(fallbackUrl, {
          headers: this.buildHeaders('www.bing.com'),
          timeout: 15000,
          responseType: 'text',
          ...this.getProxyConfig(),
        });

        this.storeCookies('bing.com', response.headers['set-cookie']);
        html = response.data as string;
        responseTimeMs = Date.now() - fallbackStart;
        result = this.parser.parse(html, query, location, responseTimeMs);
      }

      if (result.businesses.length === 0) {
        logger.warn(`[${this.engineId}] 0 businesses parsed. HTML length: ${html.length}, first 300 chars: ${html.slice(0, 300).replaceAll(/\s+/g, ' ')}`);
      }

      logger.info(
        `[${this.engineId}] Search for "${query}" returned ${result.businesses.length} businesses`,
      );

      return result;
    } catch (error: unknown) {
      this.recordError();
      logger.error(`[${this.engineId}] Search failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
