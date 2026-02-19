import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';
import { logger } from '../../config/logger.js';

/**
 * Parses Google Maps HTML responses.
 * Google Maps embeds business data in script tags as nested JSON arrays
 * within `window.APP_INITIALIZATION_STATE` or similar data payloads.
 */
export class GoogleMapsParser {
  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const businesses = this.extractBusinesses(html);

    return {
      engineId: 'google_maps',
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

  private extractBusinesses(html: string): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    try {
      // Google Maps embeds data in script tags with nested JSON arrays
      // Look for the APP_INITIALIZATION_STATE or similar data payload
      // Try to extract structured business data from embedded JSON
      const jsonArrayPattern = /\[\["([^"]{2,80})"(?:,(?:null|\d+|"[^"]*"|\[[^\]]*\]))*,\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/g;
      let match: RegExpExecArray | null;
      match = jsonArrayPattern.exec(html);
      while (match !== null) {
        const name = match[1];
        const lat = Number.parseFloat(match[2]);
        const lng = Number.parseFloat(match[3]);

        if (name && !Number.isNaN(lat) && !Number.isNaN(lng)) {
          businesses.push({
            name,
            lat,
            lng,
            resultType: 'maps',
            rankPosition: businesses.length + 1,
          });
        }
        match = jsonArrayPattern.exec(html);
      }

      // Fallback: extract from the more structured data format
      if (businesses.length === 0) {
        this.extractFromStructuredData(html, businesses);
      }
    } catch (error: unknown) {
      logger.debug(`[GoogleMapsParser] Error parsing Maps HTML: ${error instanceof Error ? error.message : String(error)}`);
    }

    return businesses;
  }

  private extractFromStructuredData(html: string, businesses: ParsedBusiness[]): void {
    // Google Maps data often appears in patterns like:
    // [null,"Business Name",null,[null,null,lat,lng],...]
    // with phone, address, rating embedded nearby

    // Extract blocks that look like place data
    const placePattern = /\["0x[0-9a-f]+:0x[0-9a-f]+",null,null,null,null,null,null,null,null,null,null,"([^"]+)"/g;
    let match: RegExpExecArray | null;
    match = placePattern.exec(html);
    while (match !== null) {
      const name = match[1];
      if (name) {
        // Try to extract additional data near this match
        const context = html.slice(Math.max(0, match.index - 500), match.index + 2000);

        const ratingMatch = /,(\d\.\d),/.exec(context);
        const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;

        const reviewMatch = /,(\d+),/.exec(context.slice(context.indexOf(name)));
        const reviewCount = reviewMatch ? Number.parseInt(reviewMatch[1], 10) : undefined;

        const phoneMatch = /\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/.exec(context);
        const phone = phoneMatch ? normalizePhone(phoneMatch[0]) ?? undefined : undefined;

        const coordMatch = /,(-?\d+\.\d{4,}),(-?\d+\.\d{4,})[,\]]/.exec(context);
        const lat = coordMatch ? Number.parseFloat(coordMatch[1]) : undefined;
        const lng = coordMatch ? Number.parseFloat(coordMatch[2]) : undefined;

        const addressMatch = /"(\d+\s[A-Z][^"]{5,60})"/.exec(context);
        const address = addressMatch ? addressMatch[1] : undefined;

        const websiteMatch = /"(https?:\/\/[^"]+)"/.exec(context);
        const website = websiteMatch ? websiteMatch[1] : undefined;

        const cidMatch = /"0x[0-9a-f]+:(0x[0-9a-f]+)"/.exec(context);
        const googleCid = cidMatch ? cidMatch[1] : undefined;

        businesses.push({
          name,
          address,
          phone,
          website,
          lat,
          lng,
          rating: rating && rating > 0 && rating <= 5 ? rating : undefined,
          reviewCount: reviewCount && reviewCount > 0 ? reviewCount : undefined,
          googleCid,
          resultType: 'maps',
          rankPosition: businesses.length + 1,
        });
      }
      match = placePattern.exec(html);
    }
  }
}
