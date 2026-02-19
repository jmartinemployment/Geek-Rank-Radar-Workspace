import axios from 'axios';
import { BaseEngine } from './BaseEngine.js';
import { GoogleLocalParser } from '../parsers/GoogleLocalParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { buildUULE } from '../../utils/uule.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult } from '../../types/engine.types.js';

/**
 * Google Local Finder scraping engine.
 * Uses `tbm=lcl` parameter to return expanded local results (20+ per page).
 */
export class GoogleLocalEngine extends BaseEngine {
  readonly engineId = 'google_local';
  readonly engineName = 'Google Local Finder';

  private readonly parser = new GoogleLocalParser();

  constructor() {
    super(ENGINE_CONFIGS.google_local);
  }

  async search(query: string, location: GeoPoint, city?: string, state?: string): Promise<SERPResult> {
    if (!this.canMakeRequest()) {
      throw new Error(`Google Local Finder is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();
    const uule = city && state ? buildUULE(city, state) : undefined;
    const searchQuery = uule ? query : `${query} near ${location.lat},${location.lng}`;

    const params: Record<string, string | number> = {
      q: searchQuery,
      tbm: 'lcl',
      hl: 'en',
      gl: 'us',
    };
    if (uule) {
      params.uule = uule;
    }

    try {
      const response = await axios.get('https://www.google.com/search', {
        headers: this.buildHeaders(),
        params,
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
