import * as cheerio from 'cheerio';
import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';
import { logger } from '../../config/logger.js';

/**
 * Parses Google Local Finder HTML (tbm=lcl) into standardized SERPResult.
 * Calibrated February 2026 against live Google HTML.
 *
 * Structure (per listing):
 *   div.w7Dbne > div.uMdZh > div.VkpGBb > div.cXedhc
 *     a.vwVdIc[data-cid]  (main link, has CID)
 *       div > div.rllt__details
 *         div:nth-child(1) = heading (div.dbg0pd > span.OSrXXb = name)
 *         div:nth-child(2) = rating + price + category line
 *         div:nth-child(3) = address
 *         div:nth-child(4) = review snippet (.pJ3Ci)
 */
export class GoogleLocalParser {
  static readonly PARSER_VERSION = '2026-02-19';

  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const $ = cheerio.load(html);
    let businesses = this.parseLocalResults($);

    // Fallback: regex extraction if selectors find nothing
    if (businesses.length === 0) {
      logger.debug('[GoogleLocalParser] Cheerio selectors found 0 results, trying regex fallback');
      businesses = this.regexFallback(html);
    }

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
        parserVersion: GoogleLocalParser.PARSER_VERSION,
      },
    };
  }

  private parseLocalResults($: cheerio.CheerioAPI): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    // Primary selector: div.VkpGBb is the individual listing container
    $('div.VkpGBb').each((_i, el) => {
      const $el = $(el);

      // Business name: div.dbg0pd > span.OSrXXb
      const name = $el.find('.dbg0pd .OSrXXb').first().text().trim();
      if (!name) return;

      // Skip duplicates
      if (businesses.some((b) => b.name === name)) return;

      // Rating + review count from aria-label: "Rated 4.8 out of 5, 160 user reviews"
      const ratingSpan = $el.find('span.Y0A0hc[aria-label]').first();
      const ariaLabel = ratingSpan.attr('aria-label') ?? '';
      const { rating, reviewCount } = this.parseRatingAriaLabel(ariaLabel);

      // Fallback: visible rating text
      const fallbackRating = rating ?? this.parseVisibleRating($el);
      const fallbackReviewCount = reviewCount ?? this.parseVisibleReviewCount($el);

      // Address: 3rd child div inside .rllt__details
      const detailsDivs = $el.find('div.rllt__details > div').toArray();
      const address = detailsDivs.length >= 3
        ? $(detailsDivs[2]).text().trim()
        : undefined;

      // Category: text node inside the 2nd child div after rating/price
      // Pattern: "... · Pizza" — extract last segment after middot
      const ratingLine = detailsDivs.length >= 2
        ? $(detailsDivs[1]).text().trim()
        : '';
      const type = this.extractCategory(ratingLine);

      // Phone: try to find in any text (rare in Local Finder, but may appear)
      const phone = this.extractPhone($el.text());

      // Google CID from the listing link
      const googleCid = $el.find('a[data-cid]').first().attr('data-cid') ?? undefined;

      businesses.push({
        name,
        address: address || undefined,
        phone: normalizePhone(phone) ?? undefined,
        rating: fallbackRating && !Number.isNaN(fallbackRating) ? fallbackRating : undefined,
        reviewCount: fallbackReviewCount,
        primaryType: type || undefined,
        googleCid,
        resultType: 'local_finder',
        rankPosition: businesses.length + 1,
      });
    });

    return businesses;
  }

  /**
   * Parse "Rated 4.8 out of 5, 160 user reviews" aria-label.
   * Handles K/M suffixes: "1K", "1.9K", "3.1K".
   */
  private parseRatingAriaLabel(label: string): { rating?: number; reviewCount?: number } {
    if (!label) return {};

    const ratingMatch = /Rated (\d+\.?\d*) out of 5/.exec(label);
    const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;

    const reviewMatch = /([\d,.]+[KkMm]?)\s*user reviews?/.exec(label);
    let reviewCount: number | undefined;
    if (reviewMatch) {
      reviewCount = this.parseCompactNumber(reviewMatch[1]);
    }

    return { rating, reviewCount };
  }

  /**
   * Parse compact number strings: "160", "1K", "1.9K", "3.1K", "1M".
   */
  private parseCompactNumber(text: string): number | undefined {
    const cleaned = text.replaceAll(',', '').trim();
    const match = /^([\d.]+)([KkMm]?)$/.exec(cleaned);
    if (!match) return undefined;

    let num = Number.parseFloat(match[1]);
    const suffix = match[2].toUpperCase();
    if (suffix === 'K') num *= 1000;
    if (suffix === 'M') num *= 1_000_000;

    return Number.isNaN(num) ? undefined : Math.round(num);
  }

  private parseVisibleRating($el: ReturnType<cheerio.CheerioAPI>): number | undefined {
    const text = $el.find('span.yi40Hd').first().text().trim();
    if (!text) return undefined;
    const val = Number.parseFloat(text);
    return val > 0 && val <= 5 ? val : undefined;
  }

  private parseVisibleReviewCount($el: ReturnType<cheerio.CheerioAPI>): number | undefined {
    const text = $el.find('span.RDApEe').first().text().trim();
    if (!text) return undefined;
    // Remove parentheses: "(160)" -> "160", "(1K)" -> "1K"
    const cleaned = text.replaceAll(/[()]/g, '');
    return this.parseCompactNumber(cleaned);
  }

  /**
   * Extract category from the rating line.
   * Example: "4.8 (160) · $10–20 · Pizza" → "Pizza"
   * Last segment after the final middot.
   */
  private extractCategory(line: string): string | undefined {
    const parts = line.split('·').map((p) => p.trim());
    if (parts.length < 2) return undefined;
    const last = parts.at(-1);
    // Skip if it looks like a price
    if (!last || /^\$/.test(last)) return undefined;
    return last;
  }

  /**
   * Regex fallback: extract business names and data from raw HTML
   * when Cheerio selectors fail.
   */
  private regexFallback(html: string): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];
    const seen = new Set<string>();

    // Pattern 1: aria-label with "Rated X out of 5" near a heading
    const headingPattern = /class="OSrXXb"[^>]*>([^<]+)</g;
    let match: RegExpExecArray | null;
    match = headingPattern.exec(html);
    while (match !== null) {
      const name = match[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);

        // Look for rating in nearby context (500 chars after)
        const context = html.slice(match.index, match.index + 1000);
        const ratingMatch = /Rated (\d+\.?\d*) out of 5,\s*([\d,.]+[KkMm]?)\s*user reviews?/.exec(context);
        const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;
        const reviewCount = ratingMatch ? this.parseCompactNumber(ratingMatch[2]) : undefined;

        // Look for data-cid
        const cidMatch = /data-cid="(\d+)"/.exec(context);

        businesses.push({
          name,
          rating: rating && rating > 0 && rating <= 5 ? rating : undefined,
          reviewCount,
          googleCid: cidMatch ? cidMatch[1] : undefined,
          resultType: 'local_finder',
          rankPosition: businesses.length + 1,
        });
      }
      match = headingPattern.exec(html);
    }

    return businesses;
  }

  private extractPhone(text: string): string {
    const phonePattern = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
    const match = phonePattern.exec(text);
    return match ? match[0] : '';
  }
}
