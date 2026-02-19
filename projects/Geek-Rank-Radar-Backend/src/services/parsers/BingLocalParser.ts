import * as cheerio from 'cheerio';
import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';

/**
 * Parses Bing Maps HTML into standardized SERPResult.
 * Extracts business listings from Bing Maps search results.
 */
export class BingLocalParser {
  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const $ = cheerio.load(html);
    const businesses = this.parseBusinessListings($);

    return {
      engineId: 'bing_local',
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

  private parseBusinessListings($: cheerio.CheerioAPI): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    // Bing Maps listing selectors
    const selectors = [
      '.taskCard .listing',
      '.entity-listing',
      'div[data-entityid]',
      '.lm_entry',
    ];

    for (const selector of selectors) {
      $(selector).each((_i, el) => {
        const $el = $(el);

        const name = $el.find('.lm_entry_title, .listing_title, a.titleLink').first().text().trim() ||
          $el.find('h2, h3').first().text().trim();

        if (!name) return;

        const ratingText = $el.find('.csrc, .rating-value, [aria-label*="rating"]').first()
          .attr('aria-label') ?? $el.find('.csrc').first().text().trim();
        const ratingMatch = /(\d\.?\d?)/.exec(ratingText ?? '');
        const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;

        const reviewText = $el.find('.reviewCount, .ratingCount').first().text().trim();
        const reviewMatch = /\d[\d,]*/.exec(reviewText);
        const reviewCount = reviewMatch
          ? Number.parseInt(reviewMatch[0].replaceAll(',', ''), 10)
          : undefined;

        const address = $el.find('.lm_entry_address, .listing_address, .address').first().text().trim();

        const phoneRaw = $el.find('.lm_entry_phone, .listing_phone, .phone').first().text().trim() ||
          this.extractPhone($el.text());

        const website = $el.find('a.website, a[href*="http"]:not([href*="bing"])').attr('href') ?? undefined;

        const categories = $el.find('.lm_entry_categories, .categories').first().text().trim();

        const entityId = $el.attr('data-entityid') ?? undefined;

        businesses.push({
          name,
          address: address || undefined,
          phone: normalizePhone(phoneRaw) ?? undefined,
          website,
          rating: rating && !Number.isNaN(rating) && rating <= 5 ? rating : undefined,
          reviewCount,
          primaryType: categories || undefined,
          bingPlaceId: entityId,
          resultType: 'local_pack',
          rankPosition: businesses.length + 1,
        });
      });

      if (businesses.length > 0) break;
    }

    // Fallback: try JSON-LD or embedded data
    if (businesses.length === 0) {
      this.extractFromJsonLd($, businesses);
    }

    return businesses;
  }

  private extractFromJsonLd($: cheerio.CheerioAPI, businesses: ParsedBusiness[]): void {
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '{}') as Record<string, unknown>;
        if (data['@type'] === 'LocalBusiness' || data['@type'] === 'Restaurant') {
          const name = data.name as string | undefined;
          if (!name) return;

          const address = data.address as Record<string, string> | undefined;
          const geo = data.geo as Record<string, number> | undefined;

          businesses.push({
            name,
            address: address?.streetAddress,
            city: address?.addressLocality,
            state: address?.addressRegion,
            zip: address?.postalCode,
            phone: normalizePhone(data.telephone as string | undefined) ?? undefined,
            website: data.url as string | undefined,
            lat: geo?.latitude,
            lng: geo?.longitude,
            primaryType: data['@type'] as string,
            resultType: 'local_pack',
            rankPosition: businesses.length + 1,
          });
        }
      } catch {
        // Skip invalid JSON-LD blocks
      }
    });
  }

  private extractPhone(text: string): string {
    const phonePattern = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
    const match = phonePattern.exec(text);
    return match ? match[0] : '';
  }
}
