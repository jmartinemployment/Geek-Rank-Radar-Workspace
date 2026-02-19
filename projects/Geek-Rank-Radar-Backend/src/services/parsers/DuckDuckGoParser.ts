import * as cheerio from 'cheerio';
import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
  OrganicResult,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';

/**
 * Parses DuckDuckGo HTML-only results page.
 * DDG doesn't have a structured local pack, but local businesses
 * appear in organic results with embedded address/phone in snippets.
 */
export class DuckDuckGoParser {
  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const $ = cheerio.load(html);
    const organicResults = this.parseOrganicResults($);
    const businesses = this.extractBusinessesFromSnippets($);

    return {
      engineId: 'duckduckgo',
      query,
      location,
      timestamp: new Date(),
      businesses,
      organicResults,
      metadata: {
        captchaDetected: false,
        responseTimeMs,
      },
    };
  }

  private parseOrganicResults($: cheerio.CheerioAPI): OrganicResult[] {
    const results: OrganicResult[] = [];

    // DDG HTML version uses .result class for each result
    $('div.result, div.web-result').each((_i, el) => {
      const $el = $(el);

      const linkEl = $el.find('a.result__a, a.result__url').first();
      const url = linkEl.attr('href') ?? '';
      if (!url || !url.startsWith('http')) return;

      const title = $el.find('a.result__a, h2.result__title a').first().text().trim();
      if (!title) return;

      const snippet = $el.find('a.result__snippet, .result__snippet').first().text().trim();

      let domain = '';
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = $el.find('.result__url, span.result__url__domain').first().text().trim();
      }

      results.push({
        position: results.length + 1,
        title,
        url,
        domain,
        snippet: snippet || '',
        resultType: 'organic',
      });
    });

    return results;
  }

  private extractBusinessesFromSnippets($: cheerio.CheerioAPI): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    // DDG sometimes includes local business info in snippets
    // Look for results that contain phone numbers or addresses
    $('div.result, div.web-result').each((_i, el) => {
      const $el = $(el);
      const snippet = $el.find('a.result__snippet, .result__snippet').first().text().trim();
      const title = $el.find('a.result__a, h2.result__title a').first().text().trim();
      const url = $el.find('a.result__a').attr('href') ?? undefined;

      if (!title || !snippet) return;

      // Check if snippet contains a phone number (strong indicator of local business)
      const phoneMatch = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(snippet);
      if (!phoneMatch) return;

      const phone = normalizePhone(phoneMatch[0]) ?? undefined;
      if (!phone) return;

      // Try to extract address from snippet
      const addressMatch = /(\d+\s+[A-Za-z][\w\s]{3,40}(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl|Pkwy|Hwy)\.?)/.exec(snippet);
      const address = addressMatch ? addressMatch[1] : undefined;

      let website: string | undefined;
      try {
        if (url) website = new URL(url).origin;
      } catch {
        // ignore invalid URLs
      }

      businesses.push({
        name: title,
        address,
        phone,
        website,
        resultType: 'organic',
        rankPosition: businesses.length + 1,
      });
    });

    return businesses;
  }
}
