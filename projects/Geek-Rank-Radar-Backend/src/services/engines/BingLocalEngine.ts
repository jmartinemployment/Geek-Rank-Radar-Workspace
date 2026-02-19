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

  async search(query: string, location: GeoPoint): Promise<SERPResult> {
    if (!this.canMakeRequest()) {
      throw new Error(`Bing Local is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.bing.com/maps?q=${encodedQuery}&where1=${location.lat},${location.lng}`;

    try {
      const response = await axios.get(url, {
        headers: this.buildHeaders(),
        timeout: 15000,
        responseType: 'text',
      });

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
