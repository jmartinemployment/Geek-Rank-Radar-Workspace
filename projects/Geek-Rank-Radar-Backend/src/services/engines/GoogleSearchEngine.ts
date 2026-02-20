import axios, { AxiosError } from 'axios';
import { BaseEngine } from './BaseEngine.js';
import { GoogleSearchParser } from '../parsers/GoogleSearchParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { buildUULE } from '../../utils/uule.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult } from '../../types/engine.types.js';

/**
 * Google Web Search scraping engine.
 * Uses UULE parameter for location targeting when city/state are available,
 * falls back to appending "near lat,lng" to the query.
 */
export class GoogleSearchEngine extends BaseEngine {
  readonly engineId = 'google_search';
  readonly engineName = 'Google Web Search';

  private readonly parser = new GoogleSearchParser();

  constructor() {
    super(ENGINE_CONFIGS.google_search);
  }

  async search(query: string, location: GeoPoint, city?: string, state?: string): Promise<SERPResult> {
    if (!this.canMakeRequest()) {
      throw new Error(`Google Search is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();
    const uule = city && state ? buildUULE(city, state) : undefined;
    const searchQuery = uule ? query : `${query} near ${location.lat},${location.lng}`;

    const url = 'https://www.google.com/search';
    const params: Record<string, string | number> = {
      q: searchQuery,
      num: 20,
      hl: 'en',
      gl: 'us',
    };
    if (uule) {
      params.uule = uule;
    }

    try {
      const response = await axios.get(url, {
        headers: this.buildHeaders('www.google.com'),
        params,
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

      // Treat 429 as a block — stop hammering Google
      if (error instanceof AxiosError && error.response?.status === 429) {
        logger.warn(`[${this.engineId}] HTTP 429 rate limited — triggering block`);
        this.markBlocked();
      }

      logger.error(`[${this.engineId}] Search failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
