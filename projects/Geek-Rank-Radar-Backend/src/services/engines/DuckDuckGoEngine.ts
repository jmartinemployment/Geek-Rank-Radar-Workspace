import axios from 'axios';
import { BaseEngine } from './BaseEngine.js';
import { DuckDuckGoParser } from '../parsers/DuckDuckGoParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult } from '../../types/engine.types.js';

/**
 * DuckDuckGo HTML scraping engine.
 * Uses the HTML-only version (html.duckduckgo.com) which has minimal bot detection.
 * Location targeting is achieved by appending city/state to the query.
 */
export class DuckDuckGoEngine extends BaseEngine {
  readonly engineId = 'duckduckgo';
  readonly engineName = 'DuckDuckGo';

  private readonly parser = new DuckDuckGoParser();

  constructor() {
    super(ENGINE_CONFIGS.duckduckgo);
  }

  async search(query: string, location: GeoPoint, city?: string, state?: string): Promise<SERPResult> {
    if (!this.canMakeRequest()) {
      throw new Error(`DuckDuckGo is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();
    const locationSuffix = city && state ? `${city} ${state}` : `${location.lat},${location.lng}`;
    const searchQuery = `${query} near ${locationSuffix}`;
    const encodedQuery = encodeURIComponent(searchQuery);

    try {
      const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
        headers: this.buildHeaders('html.duckduckgo.com'),
        timeout: 15000,
        responseType: 'text',
        ...this.getProxyConfig(),
      });

      this.storeCookies('duckduckgo.com', response.headers['set-cookie']);
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
      const result = this.parser.parse(html, query, location, responseTimeMs);

      if (result.businesses.length === 0 && result.organicResults.length === 0) {
        logger.warn(`[${this.engineId}] 0 results parsed. HTML length: ${html.length}, first 300 chars: ${html.slice(0, 300).replaceAll(/\s+/g, ' ')}`);
      }

      logger.info(
        `[${this.engineId}] Search for "${query}" returned ${result.businesses.length} businesses, ${result.organicResults.length} organic`,
      );

      return result;
    } catch (error: unknown) {
      this.recordError();
      logger.error(`[${this.engineId}] Search failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
