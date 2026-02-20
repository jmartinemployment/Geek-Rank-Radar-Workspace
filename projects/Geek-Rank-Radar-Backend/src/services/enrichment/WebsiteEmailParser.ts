import * as cheerio from 'cheerio';
import { logger } from '../../config/logger.js';

/** Common patterns that look like emails but aren't useful */
const JUNK_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^webmaster@/i,
  /^admin@example\./i,
  /^test@/i,
  /^email@example\./i,
  /^user@/i,
  /^username@/i,
  /^your-?email@/i,
  /^name@/i,
  /@example\.(com|org|net)$/i,
  /@sentry\./i,
  /@wixpress\./i,
  /@googleapis\./i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.svg$/i,
  /\.webp$/i,
];

/** Image/asset file extensions that get false-matched */
const ASSET_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|pdf)$/i;

/**
 * Extracts email addresses from HTML content.
 * Uses multiple strategies: mailto links, visible text regex, meta tags, structured data.
 */
export class WebsiteEmailParser {
  /**
   * Parse HTML and return deduplicated, validated email addresses.
   * Emails are sorted by confidence: mailto links first, then visible text.
   */
  parse(html: string): string[] {
    const $ = cheerio.load(html);
    const emails = new Set<string>();

    // Strategy 1: mailto: links (highest confidence)
    this.extractMailtoLinks($, emails);

    // Strategy 2: Visible text patterns
    this.extractFromText($, emails);

    // Strategy 3: JSON-LD structured data
    this.extractFromJsonLd($, emails);

    // Strategy 4: Meta tags (og:email, contact:email)
    this.extractFromMeta($, emails);

    // Strategy 5: Raw HTML regex (catches obfuscated emails)
    this.extractFromRawHtml(html, emails);

    // Filter junk and validate
    const filtered = [...emails].filter((email) => this.isValidEmail(email));

    logger.debug(`[WebsiteEmailParser] Found ${filtered.length} valid emails from ${emails.size} candidates`);

    return filtered;
  }

  /**
   * Identify likely contact page URLs from a page's links.
   */
  findContactPageUrls($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const contactPatterns = /\b(contact|about|team|staff|connect|reach|get-in-touch|support)\b/i;
    const urls: string[] = [];

    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') ?? '';
      const text = $(el).text().trim().toLowerCase();

      const hrefMatch = contactPatterns.exec(href) !== null;
      const textMatch = contactPatterns.exec(text) !== null;

      if (hrefMatch || textMatch) {
        try {
          const resolved = new URL(href, baseUrl).href;
          // Only same-origin links
          if (new URL(resolved).origin === new URL(baseUrl).origin) {
            urls.push(resolved);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    });

    // Deduplicate
    return [...new Set(urls)].slice(0, 5);
  }

  private extractMailtoLinks($: cheerio.CheerioAPI, emails: Set<string>): void {
    $('a[href^="mailto:"]').each((_i, el) => {
      const href = $(el).attr('href') ?? '';
      const email = href.replaceAll('mailto:', '').split('?').at(0)?.trim().toLowerCase();
      if (email) {
        emails.add(email);
      }
    });
  }

  private extractFromText($: cheerio.CheerioAPI, emails: Set<string>): void {
    // Get visible text content (skip scripts, styles, hidden elements)
    $('script, style, noscript, svg, [hidden], [aria-hidden="true"]').remove();
    const text = $('body').text();
    this.matchEmails(text, emails);
  }

  private extractFromJsonLd($: cheerio.CheerioAPI, emails: Set<string>): void {
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '{}') as Record<string, unknown>;
        this.extractEmailsFromObject(data, emails);
      } catch {
        // Invalid JSON-LD, skip
      }
    });
  }

  private extractEmailsFromObject(obj: unknown, emails: Set<string>): void {
    if (typeof obj === 'string') {
      this.matchEmails(obj, emails);
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractEmailsFromObject(item, emails);
      }
      return;
    }
    if (obj !== null && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      // Check common email fields
      for (const key of ['email', 'contactPoint', 'author', 'creator', 'member']) {
        if (key in record) {
          this.extractEmailsFromObject(record[key], emails);
        }
      }
    }
  }

  private extractFromMeta($: cheerio.CheerioAPI, emails: Set<string>): void {
    $('meta[property*="email"], meta[name*="email"], meta[itemprop="email"]').each((_i, el) => {
      const content = $(el).attr('content') ?? '';
      this.matchEmails(content, emails);
    });
  }

  private extractFromRawHtml(html: string, emails: Set<string>): void {
    // Catch emails that might be in data attributes, comments, or obfuscated
    this.matchEmails(html, emails);
  }

  private matchEmails(text: string, emails: Set<string>): void {
    // Standard email regex — permissive but reasonable
    const emailRegex = /[a-zA-Z\d._%+-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}/g;
    let match: RegExpExecArray | null;

    while ((match = emailRegex.exec(text)) !== null) {
      emails.add(match[0].toLowerCase());
    }
  }

  private isValidEmail(email: string): boolean {
    // Basic format check
    if (email.length > 254) return false;
    if (email.length < 5) return false;

    // Must have exactly one @
    const parts = email.split('@');
    if (parts.length !== 2) return false;

    const [local, domain] = parts;
    if (!local || !domain) return false;

    // Domain must have at least one dot
    if (!domain.includes('.')) return false;

    // TLD must be 2+ chars
    const tld = domain.split('.').at(-1) ?? '';
    if (tld.length < 2) return false;

    // Check against junk patterns
    for (const pattern of JUNK_PATTERNS) {
      if (pattern.exec(email) !== null) return false;
    }

    // Check against asset file extensions
    if (ASSET_EXTENSIONS.exec(email) !== null) return false;

    return true;
  }
}
