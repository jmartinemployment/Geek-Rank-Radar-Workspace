import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';
import { logger } from '../../config/logger.js';

/**
 * Parses Google Maps HTML responses.
 *
 * LIMITATION (February 2026): Google Maps is a JavaScript SPA.
 * The initial HTML response contains only a shell — business data is loaded
 * via XHR after JS execution. HTTP-only scraping (axios) will not return
 * business listings. For reliable extraction, GoogleMapsEngine would need
 * to use Playwright with page.waitForSelector() or intercept XHR responses.
 *
 * This parser attempts multiple extraction strategies as fallbacks:
 * 1. Embedded JSON arrays in script tags (rare but occasionally present)
 * 2. Structured data (application/ld+json)
 * 3. Proto-buffer style nested arrays from APP_INITIALIZATION_STATE
 * 4. Regex extraction from any visible text in the HTML
 */
export class GoogleMapsParser {
  static readonly PARSER_VERSION = '2026-02-19';

  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const businesses = this.extractBusinesses(html);

    if (businesses.length === 0) {
      logger.debug('[GoogleMapsParser] No businesses extracted — Google Maps requires JS execution for full results');
    }

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
        parserVersion: GoogleMapsParser.PARSER_VERSION,
      },
    };
  }

  private extractBusinesses(html: string): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    try {
      // Strategy 1: Look for embedded JSON arrays with business names + coords
      this.extractFromJsonArrays(html, businesses);

      // Strategy 2: Look for application/ld+json structured data
      if (businesses.length === 0) {
        this.extractFromStructuredData(html, businesses);
      }

      // Strategy 3: Look for place data in proto-style nested arrays
      if (businesses.length === 0) {
        this.extractFromProtoArrays(html, businesses);
      }

      // Strategy 4: Extract from visible text patterns
      if (businesses.length === 0) {
        this.extractFromTextPatterns(html, businesses);
      }
    } catch (error: unknown) {
      logger.debug(`[GoogleMapsParser] Error parsing Maps HTML: ${error instanceof Error ? error.message : String(error)}`);
    }

    return businesses;
  }

  /**
   * Strategy 1: Embedded JSON arrays with name + coordinates.
   * Pattern: [["Business Name",...,[null,null,lat,lng]]
   */
  private extractFromJsonArrays(html: string, businesses: ParsedBusiness[]): void {
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
  }

  /**
   * Strategy 2: application/ld+json structured data.
   * If present, contains LocalBusiness or Restaurant schema.
   */
  private extractFromStructuredData(html: string, businesses: ParsedBusiness[]): void {
    const ldJsonPattern = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    let match: RegExpExecArray | null;
    match = ldJsonPattern.exec(html);
    while (match !== null) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        const items = Array.isArray(data) ? data : (data.itemListElement as unknown[]) ?? [data];

        for (const item of items) {
          const biz = item as Record<string, unknown>;
          const name = (biz.name as string) ?? '';
          if (!name) continue;

          const address = biz.address as Record<string, string> | undefined;
          const geo = biz.geo as Record<string, number> | undefined;
          const rating = biz.aggregateRating as Record<string, unknown> | undefined;

          businesses.push({
            name,
            address: address?.streetAddress,
            phone: normalizePhone(biz.telephone as string) ?? undefined,
            website: biz.url as string | undefined,
            lat: geo?.latitude,
            lng: geo?.longitude,
            rating: rating?.ratingValue as number | undefined,
            reviewCount: rating?.reviewCount as number | undefined,
            resultType: 'maps',
            rankPosition: businesses.length + 1,
          });
        }
      } catch {
        // Invalid JSON, skip
      }
      match = ldJsonPattern.exec(html);
    }
  }

  /**
   * Strategy 3: Proto-buffer style place data.
   * Pattern: ["0x...hex...:0x...hex...",null,null,...,"Business Name"]
   */
  private extractFromProtoArrays(html: string, businesses: ParsedBusiness[]): void {
    const placePattern = /\["0x[0-9a-f]+:0x[0-9a-f]+"(?:,(?:null|"[^"]*"))*,"([^"]{2,80})"/g;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();

    match = placePattern.exec(html);
    while (match !== null) {
      const name = match[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        const context = html.slice(Math.max(0, match.index - 500), match.index + 2000);

        const ratingMatch = /,(\d\.\d),/.exec(context);
        const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;

        const phoneMatch = /\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/.exec(context);
        const phone = phoneMatch ? normalizePhone(phoneMatch[0]) ?? undefined : undefined;

        const coordMatch = /,(-?\d+\.\d{4,}),(-?\d+\.\d{4,})[,\]]/.exec(context);
        const lat = coordMatch ? Number.parseFloat(coordMatch[1]) : undefined;
        const lng = coordMatch ? Number.parseFloat(coordMatch[2]) : undefined;

        const addressMatch = /"(\d+\s[A-Z][^"]{5,60})"/.exec(context);
        const address = addressMatch ? addressMatch[1] : undefined;

        const websiteMatch = /"(https?:\/\/(?!www\.google)[^"]+)"/.exec(context);
        const website = websiteMatch ? websiteMatch[1] : undefined;

        businesses.push({
          name,
          address,
          phone,
          website,
          lat,
          lng,
          rating: rating && rating > 0 && rating <= 5 ? rating : undefined,
          resultType: 'maps',
          rankPosition: businesses.length + 1,
        });
      }
      match = placePattern.exec(html);
    }
  }

  /**
   * Strategy 4: Extract from visible text patterns.
   * Look for business-like names near addresses and phone numbers.
   */
  private extractFromTextPatterns(html: string, businesses: ParsedBusiness[]): void {
    // Look for patterns like: "Business Name" followed by address
    const textPattern = /"([A-Z][A-Za-z'\s&.,-]{2,60}(?:Pizza|Restaurant|Grill|Cafe|Bar|Deli|Bakery|Kitchen|Bistro|Pub|House|Shop|Store))"\s*[,\]]/g;
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    match = textPattern.exec(html);
    while (match !== null) {
      const name = match[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        businesses.push({
          name,
          resultType: 'maps',
          rankPosition: businesses.length + 1,
        });
      }
      match = textPattern.exec(html);
    }
  }
}
