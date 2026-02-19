import axios from 'axios';
import { BaseEngine } from './BaseEngine.js';
import { GoogleMapsParser } from '../parsers/GoogleMapsParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult } from '../../types/engine.types.js';

/**
 * Google Maps scraping engine.
 * Searches Google Maps for businesses at a specific location.
 */
export class GoogleMapsEngine extends BaseEngine {
  readonly engineId = 'google_maps';
  readonly engineName = 'Google Maps';

  private readonly parser = new GoogleMapsParser();

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
