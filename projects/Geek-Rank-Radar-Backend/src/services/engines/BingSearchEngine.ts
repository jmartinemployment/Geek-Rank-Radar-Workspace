import axios from 'axios';
import { BaseEngine } from './BaseEngine.js';
import { BingSearchParser } from '../parsers/BingSearchParser.js';
import { ENGINE_CONFIGS } from '../../config/engines.js';
import { getEnv } from '../../config/environment.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { GeoPoint, SERPResult } from '../../types/engine.types.js';

/**
 * Bing Web Search API engine.
 * Legitimate API — 1,000 free calls/month. Structured JSON, no scraping.
 * This is the workhorse engine.
 */
export class BingSearchEngine extends BaseEngine {
  readonly engineId = 'bing_api';
  readonly engineName = 'Bing Web Search API';

  private readonly parser = new BingSearchParser();

  constructor() {
    super(ENGINE_CONFIGS.bing_api);
  }

  async search(query: string, location: GeoPoint): Promise<SERPResult> {
    const apiKey = getEnv().BING_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('BING_SEARCH_API_KEY is not configured');
    }

    if (!this.canMakeRequest()) {
      throw new Error(`Bing API is ${this.getStatus()}, cannot make request`);
    }

    await this.waitForThrottle();

    const startTime = Date.now();

    try {
      const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
        params: {
          q: query,
          mkt: 'en-US',
          count: 50,
          responseFilter: 'Webpages,Places',
          lat: location.lat,
          lng: location.lng,
        },
        timeout: 15000,
      });

      this.recordRequest();

      const responseTimeMs = Date.now() - startTime;
      const result = this.parser.parse(response.data, query, location, responseTimeMs);

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
