import * as cheerio from 'cheerio';
import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
  OrganicResult,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';
import { logger } from '../../config/logger.js';

/**
 * Parses Google Search SERP HTML into standardized SERPResult.
 * Extracts local pack (3-pack), organic results, and People Also Ask.
 *
 * Calibrated February 2026. Local pack selectors aligned with
 * GoogleLocalParser (same DOM structure in search results).
 */
export class GoogleSearchParser {
  static readonly PARSER_VERSION = '2026-02-19';

  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const $ = cheerio.load(html);

    let businesses = this.parseLocalPack($);
    const organicResults = this.parseOrganicResults($);
    const peopleAlsoAsk = this.parsePeopleAlsoAsk($);
    const relatedSearches = this.parseRelatedSearches($);

    // Fallback: regex extraction if selectors find 0 businesses
    if (businesses.length === 0) {
      logger.debug('[GoogleSearchParser] Cheerio local pack found 0 results, trying regex fallback');
      businesses = this.regexFallbackBusinesses(html);
    }

    return {
      engineId: 'google_search',
      query,
      location,
      timestamp: new Date(),
      businesses,
      organicResults,
      metadata: {
        captchaDetected: false,
        responseTimeMs,
        peopleAlsoAsk: peopleAlsoAsk.length > 0 ? peopleAlsoAsk : undefined,
        relatedSearches: relatedSearches.length > 0 ? relatedSearches : undefined,
        parserVersion: GoogleSearchParser.PARSER_VERSION,
      },
    };
  }

  private parseLocalPack($: cheerio.CheerioAPI): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    // Google local pack containers — try multiple selectors from most to least specific.
    // VkpGBb is the primary listing container (confirmed in Local Finder, shared in Search).
    const localSelectors = [
      'div.VkpGBb',
      'div[data-cid]',
      'div.uMdZh',
    ];

    for (const selector of localSelectors) {
      $(selector).each((_index, el) => {
        const $el = $(el);

        // Name: heading span in the listing
        const name = $el.find('.dbg0pd .OSrXXb').first().text().trim() ||
          $el.find('span.OSrXXb').first().text().trim() ||
          $el.find('div[role="heading"]').first().text().trim() ||
          $el.find('a[data-cid] span').first().text().trim();

        if (!name) return;
        if (businesses.some((b) => b.name === name)) return;

        // Rating + review count from aria-label (most reliable)
        const ariaLabel = $el.find('span.Y0A0hc[aria-label]').first().attr('aria-label') ?? '';
        const { rating: ariaRating, reviewCount: ariaReviewCount } = this.parseRatingAriaLabel(ariaLabel);

        // Fallback visible rating
        const ratingText = $el.find('span.yi40Hd, span.MW4etd').first().text().trim();
        const visibleRating = ratingText ? Number.parseFloat(ratingText) : undefined;
        const rating = ariaRating ?? visibleRating;

        // Fallback visible review count
        const reviewText = $el.find('span.RDApEe, span.UY7F9').first().text().trim();
        const visibleReviewCount = reviewText ? this.parseCompactNumber(reviewText.replaceAll(/[()]/g, '')) : undefined;
        const reviewCount = ariaReviewCount ?? visibleReviewCount;

        // Address: from detail lines
        const detailsDivs = $el.find('div.rllt__details > div').toArray();
        const address = detailsDivs.length >= 3
          ? $(detailsDivs[2]).text().trim()
          : $el.find('span[data-dtype="d3adr"]').first().text().trim() || undefined;

        const phone = $el.find('span[data-dtype="d3tel"]').first().text().trim() ||
          this.extractPhone($el.text());

        // Category from rating line
        const ratingLine = detailsDivs.length >= 2 ? $(detailsDivs[1]).text().trim() : '';
        const type = this.extractCategory(ratingLine) ||
          $el.find('span.YhemCb').first().text().trim() || undefined;

        const mapsLink = $el.find('a[href*="/maps/"]').attr('href') ??
          $el.find('a[data-cid]').attr('href');

        const googleCid = $el.find('a[data-cid]').first().attr('data-cid') ??
          $el.attr('data-cid') ?? undefined;

        businesses.push({
          name,
          address: address || undefined,
          phone: normalizePhone(phone) ?? undefined,
          rating: rating && !Number.isNaN(rating) && rating > 0 && rating <= 5 ? rating : undefined,
          reviewCount,
          primaryType: type || undefined,
          googleMapsUrl: mapsLink ?? undefined,
          googleCid,
          resultType: 'local_pack',
          rankPosition: businesses.length + 1,
        });
      });

      if (businesses.length > 0) break;
    }

    return businesses;
  }

  private parseOrganicResults($: cheerio.CheerioAPI): OrganicResult[] {
    const results: OrganicResult[] = [];

    $('div.g, div[data-sokoban-container]').each((_index, el) => {
      const $el = $(el);

      // Skip local pack results already parsed
      if ($el.closest('.VkpGBb, [data-attrid="kc:/local"], .uMdZh').length > 0) return;

      const linkEl = $el.find('a[href^="http"]').first();
      const url = linkEl.attr('href') ?? '';
      if (!url) return;

      const title = $el.find('h3').first().text().trim();
      if (!title) return;

      const snippet = $el.find('.VwiC3b, .st, span.aCOpRe, div[data-sncf]').first().text().trim();

      let domain = '';
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = url;
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

  private parsePeopleAlsoAsk($: cheerio.CheerioAPI): string[] {
    const questions: string[] = [];
    $('div.related-question-pair, div[data-q], div[jsname] div[data-lk]').each((_i, el) => {
      const question = $(el).attr('data-q') ?? $(el).attr('data-lk') ?? $(el).find('span').first().text().trim();
      if (question) questions.push(question);
    });
    return questions;
  }

  private parseRelatedSearches($: cheerio.CheerioAPI): string[] {
    const searches: string[] = [];
    $('div.s75CSd a, div#brs a, a.k8XOCe').each((_i, el) => {
      const text = $(el).text().trim();
      if (text) searches.push(text);
    });
    return searches;
  }

  /**
   * Parse "Rated 4.8 out of 5, 160 user reviews" aria-label.
   */
  private parseRatingAriaLabel(label: string): { rating?: number; reviewCount?: number } {
    if (!label) return {};
    const ratingMatch = /Rated (\d+\.?\d*) out of 5/.exec(label);
    const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;
    const reviewMatch = /([\d,.]+[KkMm]?)\s*user reviews?/.exec(label);
    const reviewCount = reviewMatch ? this.parseCompactNumber(reviewMatch[1]) : undefined;
    return { rating, reviewCount };
  }

  /**
   * Parse compact number strings: "160", "1K", "1.9K", "3.1K".
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

  private extractCategory(line: string): string | undefined {
    const parts = line.split('·').map((p) => p.trim());
    if (parts.length < 2) return undefined;
    const last = parts.at(-1);
    if (!last || /^\$/.test(last)) return undefined;
    return last;
  }

  /**
   * Regex fallback: extract businesses from raw HTML when selectors fail.
   */
  private regexFallbackBusinesses(html: string): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];
    const seen = new Set<string>();

    // Look for business names near rating aria-labels
    const headingPattern = /class="OSrXXb"[^>]*>([^<]+)</g;
    let match: RegExpExecArray | null;
    match = headingPattern.exec(html);
    while (match !== null) {
      const name = match[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        const context = html.slice(match.index, match.index + 1000);
        const ratingMatch = /Rated (\d+\.?\d*) out of 5,\s*([\d,.]+[KkMm]?)\s*user reviews?/.exec(context);
        const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;
        const reviewCount = ratingMatch ? this.parseCompactNumber(ratingMatch[2]) : undefined;
        const cidMatch = /data-cid="(\d+)"/.exec(context);

        businesses.push({
          name,
          rating: rating && rating > 0 && rating <= 5 ? rating : undefined,
          reviewCount,
          googleCid: cidMatch ? cidMatch[1] : undefined,
          resultType: 'local_pack',
          rankPosition: businesses.length + 1,
        });
      }
      match = headingPattern.exec(html);
    }

    // Pattern 2: look for business names + addresses in text
    if (businesses.length === 0) {
      const addressPattern = /([A-Z][A-Za-z'\s&]+(?:Pizza|Restaurant|Grill|Cafe|Bar|Deli|Bakery|Kitchen|Bistro|Pub|House))\s*[·\-–]\s*(\d+[\d\s.A-Za-z,]+(?:St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl))/g;
      match = addressPattern.exec(html);
      while (match !== null) {
        const name = match[1].trim();
        const address = match[2].trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          businesses.push({
            name,
            address,
            resultType: 'local_pack',
            rankPosition: businesses.length + 1,
          });
        }
        match = addressPattern.exec(html);
      }
    }

    return businesses;
  }

  private extractPhone(text: string): string {
    const phonePattern = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
    const match = phonePattern.exec(text);
    return match ? match[0] : '';
  }
}
