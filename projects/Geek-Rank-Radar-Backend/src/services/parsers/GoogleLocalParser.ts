import * as cheerio from 'cheerio';
import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';

/**
 * Parses Google Local Finder HTML (tbm=lcl) into standardized SERPResult.
 * Similar structure to search local pack but returns 20+ results per page.
 */
export class GoogleLocalParser {
  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const $ = cheerio.load(html);
    const businesses = this.parseLocalResults($);

    return {
      engineId: 'google_local',
      query,
      location,
      timestamp: new Date(),
      businesses,
      organicResults: [],
      metadata: {
        captchaDetected: false,
        responseTimeMs,
      },
    };
  }

  private parseLocalResults($: cheerio.CheerioAPI): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    // Local finder result containers
    const selectors = [
      'div.VkpGBb',
      'div[data-cid]',
      'div.rllt__details',
      'div[jsname] div.uMdZh',
    ];

    for (const selector of selectors) {
      $(selector).each((_i, el) => {
        const $el = $(el);

        const name = $el.find('.dbg0pd, .OSrXXb, span.MzICE, a.yYlJEf').first().text().trim() ||
          $el.find('div[role="heading"]').first().text().trim();

        if (!name) return;
        // Skip duplicates within this parse
        if (businesses.some((b) => b.name === name)) return;

        const ratingText = $el.find('span.yi40Hd, span.MW4etd').first().text().trim();
        const rating = ratingText ? Number.parseFloat(ratingText) : undefined;

        const reviewText = $el.find('span.RDApEe, span.UY7F9, span.HypWnf').first().text().trim();
        const reviewMatch = /\d[\d,]*/.exec(reviewText);
        const reviewCount = reviewMatch
          ? Number.parseInt(reviewMatch[0].replaceAll(',', ''), 10)
          : undefined;

        // Address often in second line of details
        const detailLines = $el.find('span.rllt__details div, div.lntMob').toArray()
          .map((d) => $(d).text().trim())
          .filter(Boolean);

        const type = detailLines.at(0) ?? undefined;
        const address = detailLines.at(1) ?? undefined;

        const phone = this.extractPhone($el.text());

        const website = $el.find('a[href*="http"]:not([href*="google"])').attr('href') ?? undefined;

        const googleMapsUrl = $el.find('a[href*="/maps/"]').attr('href') ?? undefined;

        const googleCid = $el.attr('data-cid') ??
          $el.find('[data-cid]').attr('data-cid') ??
          undefined;

        businesses.push({
          name,
          address,
          phone: normalizePhone(phone) ?? undefined,
          website,
          rating: rating && !Number.isNaN(rating) ? rating : undefined,
          reviewCount,
          primaryType: type,
          googleMapsUrl,
          googleCid,
          resultType: 'local_finder',
          rankPosition: businesses.length + 1,
        });
      });

      if (businesses.length > 0) break;
    }

    return businesses;
  }

  private extractPhone(text: string): string {
    const phonePattern = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
    const match = phonePattern.exec(text);
    return match ? match[0] : '';
  }
}
