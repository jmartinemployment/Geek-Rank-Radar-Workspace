import * as cheerio from 'cheerio';
import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
  OrganicResult,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';

/**
 * Parses Google Search SERP HTML into standardized SERPResult.
 * Extracts local pack (3-pack), organic results, and People Also Ask.
 */
export class GoogleSearchParser {
  parse(
    html: string,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const $ = cheerio.load(html);

    const businesses = this.parseLocalPack($);
    const organicResults = this.parseOrganicResults($);
    const peopleAlsoAsk = this.parsePeopleAlsoAsk($);
    const relatedSearches = this.parseRelatedSearches($);

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
      },
    };
  }

  private parseLocalPack($: cheerio.CheerioAPI): ParsedBusiness[] {
    const businesses: ParsedBusiness[] = [];

    // Google local pack containers
    const localSelectors = [
      'div.VkpGBb',
      'div[data-attrid="kc:/local"]',
      'div.uMdZh',
      'div[jscontroller] div[data-cid]',
    ];

    for (const selector of localSelectors) {
      $(selector).each((index, el) => {
        const $el = $(el);

        const name = $el.find('.dbg0pd, .OSrXXb, span.MzICE').first().text().trim() ||
          $el.find('a[data-cid] span').first().text().trim();

        if (!name) return;

        const ratingText = $el.find('span.yi40Hd, span.MW4etd').first().text().trim();
        const rating = ratingText ? Number.parseFloat(ratingText) : undefined;

        const reviewText = $el.find('span.RDApEe, span.UY7F9').first().text().trim();
        const reviewMatch = /\d[\d,]*/.exec(reviewText);
        const reviewCount = reviewMatch
          ? Number.parseInt(reviewMatch[0].replaceAll(',', ''), 10)
          : undefined;

        const address = $el.find('span.rllt__details div:nth-child(2), div.lntMob').first().text().trim() ||
          $el.find('span[data-dtype="d3adr"]').first().text().trim();

        const phone = $el.find('span[data-dtype="d3tel"]').first().text().trim() ||
          this.extractPhone($el.text());

        const type = $el.find('span.rllt__details div:first-child, span.YhemCb').first().text().trim();

        const mapsLink = $el.find('a[href*="/maps/"]').attr('href') ??
          $el.find('a[data-cid]').attr('href');

        const googleCid = $el.attr('data-cid') ??
          $el.find('[data-cid]').attr('data-cid');

        businesses.push({
          name,
          address: address || undefined,
          phone: normalizePhone(phone) ?? undefined,
          rating: rating && !Number.isNaN(rating) ? rating : undefined,
          reviewCount,
          primaryType: type || undefined,
          googleMapsUrl: mapsLink ?? undefined,
          googleCid: googleCid ?? undefined,
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

    $('div.g, div[data-sokoban-container]').each((index, el) => {
      const $el = $(el);

      // Skip local pack results already parsed
      if ($el.closest('.VkpGBb, [data-attrid="kc:/local"]').length > 0) return;

      const linkEl = $el.find('a[href^="http"]').first();
      const url = linkEl.attr('href') ?? '';
      if (!url) return;

      const title = $el.find('h3').first().text().trim();
      if (!title) return;

      const snippet = $el.find('.VwiC3b, .st, span.aCOpRe').first().text().trim();

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
    $('div.related-question-pair, div[data-q]').each((_i, el) => {
      const question = $(el).attr('data-q') ?? $(el).find('span').first().text().trim();
      if (question) questions.push(question);
    });
    return questions;
  }

  private parseRelatedSearches($: cheerio.CheerioAPI): string[] {
    const searches: string[] = [];
    $('div.s75CSd a, div#brs a').each((_i, el) => {
      const text = $(el).text().trim();
      if (text) searches.push(text);
    });
    return searches;
  }

  private extractPhone(text: string): string {
    const phonePattern = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
    const match = phonePattern.exec(text);
    return match ? match[0] : '';
  }
}
