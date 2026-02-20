import type { PrismaClient } from '../../generated/prisma/client/index.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { WebsiteEmailParser } from './WebsiteEmailParser.js';
import { logger } from '../../config/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import { sleep, humanDelay } from '../../utils/delay.js';
import { buildBrowserHeaders } from '../../utils/userAgents.js';
import { withRetry } from '../../utils/retry.js';

/** Delay between website fetches (ms) */
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
/** Max time to wait for a website response */
const REQUEST_TIMEOUT_MS = 15000;
/** Max HTML size to parse (5 MB) */
const MAX_HTML_SIZE = 5 * 1024 * 1024;
/** Skip enrichment if last enriched within this window (hours) */
const ENRICHMENT_COOLDOWN_HOURS = 168; // 7 days

interface EnrichmentProgress {
  total: number;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  emails: string[];
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
}

interface EnrichmentOptions {
  /** Only enrich businesses with no email yet */
  onlyMissing?: boolean;
  /** Max businesses to process in one run */
  limit?: number;
  /** Specific business IDs to enrich */
  businessIds?: string[];
  /** Only enrich businesses in these categories */
  categoryIds?: string[];
}

/**
 * Enriches Business records by scraping their websites for email addresses.
 *
 * Strategy per business:
 * 1. Fetch homepage HTML
 * 2. Extract emails from homepage
 * 3. If no emails found, identify contact/about pages and scrape those
 * 4. Store first valid email in Business.email
 * 5. Log attempt in EnrichmentLog
 */
export class EmailEnrichmentService {
  private readonly prisma: PrismaClient;
  private readonly parser = new WebsiteEmailParser();
  private progress: EnrichmentProgress = this.freshProgress();
  private abortController: AbortController | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  getProgress(): EnrichmentProgress {
    return { ...this.progress };
  }

  isRunning(): boolean {
    return this.progress.isRunning;
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('[EmailEnrichment] Stop requested');
    }
  }

  /**
   * Run email enrichment for businesses matching the given options.
   * Returns when all businesses have been processed.
   */
  async enrich(options: EnrichmentOptions = {}): Promise<EnrichmentProgress> {
    if (this.progress.isRunning) {
      logger.warn('[EmailEnrichment] Already running, returning current progress');
      return this.getProgress();
    }

    this.progress = this.freshProgress();
    this.progress.isRunning = true;
    this.progress.startedAt = new Date();
    this.abortController = new AbortController();

    try {
      const businesses = await this.findBusinessesToEnrich(options);
      this.progress.total = businesses.length;

      logger.info(`[EmailEnrichment] Starting enrichment for ${businesses.length} businesses`);

      for (const biz of businesses) {
        if (this.abortController.signal.aborted) {
          logger.info('[EmailEnrichment] Aborted by user');
          break;
        }

        await this.enrichBusiness(biz.id, biz.website, biz.name);
        this.progress.processed++;

        // Throttle between requests
        if (this.progress.processed < this.progress.total) {
          const delay = humanDelay(MIN_DELAY_MS, MAX_DELAY_MS);
          await sleep(delay);
        }
      }
    } catch (error: unknown) {
      logger.error(`[EmailEnrichment] Fatal error: ${toErrorMessage(error)}`);
    } finally {
      this.progress.isRunning = false;
      this.progress.finishedAt = new Date();
      this.abortController = null;

      logger.info(
        `[EmailEnrichment] Complete: ${this.progress.enriched} enriched, ` +
        `${this.progress.skipped} skipped, ${this.progress.failed} failed ` +
        `out of ${this.progress.total} total`,
      );
    }

    return this.getProgress();
  }

  private async findBusinessesToEnrich(options: EnrichmentOptions): Promise<Array<{ id: string; website: string | null; name: string }>> {
    const where: Record<string, unknown> = {
      isActive: true,
    };

    // Must have a website to scrape
    where.website = { not: null };

    if (options.onlyMissing !== false) {
      // Default: only businesses without an email
      where.email = null;
    }

    if (options.businessIds && options.businessIds.length > 0) {
      where.id = { in: options.businessIds };
    }

    if (options.categoryIds && options.categoryIds.length > 0) {
      where.categoryId = { in: options.categoryIds };
    }

    // Skip recently enriched businesses
    const cooldownDate = new Date(Date.now() - ENRICHMENT_COOLDOWN_HOURS * 60 * 60 * 1000);
    where.OR = [
      { lastEnrichedAt: null },
      { lastEnrichedAt: { lt: cooldownDate } },
    ];

    const businesses = await this.prisma.business.findMany({
      where,
      select: { id: true, website: true, name: true },
      take: options.limit ?? 500,
      orderBy: { lastEnrichedAt: { sort: 'asc', nulls: 'first' } },
    });

    return businesses;
  }

  private async enrichBusiness(businessId: string, website: string | null, name: string): Promise<void> {
    if (!website) {
      this.progress.skipped++;
      await this.logEnrichment(businessId, 'no_website', null);
      return;
    }

    try {
      // Normalize website URL
      const url = this.normalizeUrl(website);
      if (!url) {
        this.progress.skipped++;
        await this.logEnrichment(businessId, 'invalid_url', null);
        return;
      }

      // Step 1: Fetch and parse homepage
      let emails = await this.scrapePageForEmails(url);

      // Step 2: If no emails on homepage, try contact/about pages
      if (emails.length === 0) {
        const contactEmails = await this.scrapeContactPages(url);
        emails = contactEmails;
      }

      if (emails.length === 0) {
        this.progress.skipped++;
        await this.logEnrichment(businessId, 'no_email_found', null);
        await this.prisma.business.update({
          where: { id: businessId },
          data: { lastEnrichedAt: new Date() },
        });
        return;
      }

      // Store first email
      const email = emails[0];
      await this.prisma.business.update({
        where: { id: businessId },
        data: {
          email,
          lastEnrichedAt: new Date(),
        },
      });

      await this.logEnrichment(businessId, 'success', { email, allEmails: emails });

      this.progress.enriched++;
      this.progress.emails.push(email);
      logger.info(`[EmailEnrichment] Found email for "${name}": ${email}`);

    } catch (error: unknown) {
      this.progress.failed++;
      const msg = toErrorMessage(error);
      await this.logEnrichment(businessId, 'error', { error: msg }).catch(() => {});

      // Still update lastEnrichedAt to avoid retrying immediately
      await this.prisma.business.update({
        where: { id: businessId },
        data: { lastEnrichedAt: new Date() },
      }).catch(() => {});

      logger.debug(`[EmailEnrichment] Failed for "${name}": ${msg}`);
    }
  }

  private async scrapePageForEmails(url: string): Promise<string[]> {
    const html = await this.fetchPage(url);
    if (!html) return [];
    return this.parser.parse(html);
  }

  private async scrapeContactPages(baseUrl: string): Promise<string[]> {
    // First, fetch homepage to find contact page links
    const homepageHtml = await this.fetchPage(baseUrl);
    if (!homepageHtml) return [];

    const $ = cheerio.load(homepageHtml);
    const contactUrls = this.parser.findContactPageUrls($, baseUrl);

    if (contactUrls.length === 0) return [];

    logger.debug(`[EmailEnrichment] Checking ${contactUrls.length} contact pages for ${baseUrl}`);

    const allEmails: string[] = [];

    // Scrape up to 3 contact pages
    for (const contactUrl of contactUrls.slice(0, 3)) {
      // Brief delay between sub-page requests
      await sleep(humanDelay(1000, 2000));

      const html = await this.fetchPage(contactUrl);
      if (html) {
        const emails = this.parser.parse(html);
        allEmails.push(...emails);
      }

      if (allEmails.length > 0) break; // Found at least one, stop
    }

    // Deduplicate
    return [...new Set(allEmails)];
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      const response = await withRetry(
        () => axios.get(url, {
          headers: {
            ...buildBrowserHeaders(),
            'Referer': 'https://www.google.com/',
          },
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 3,
          responseType: 'text',
          maxContentLength: MAX_HTML_SIZE,
          validateStatus: (status) => status < 400,
        }),
        `[EmailEnrichment] fetch ${url}`,
        { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 5000 },
      );

      const contentType = String(response.headers['content-type'] ?? '');
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
        logger.debug(`[EmailEnrichment] Skipping non-HTML content: ${contentType} for ${url}`);
        return null;
      }

      return response.data as string;
    } catch (error: unknown) {
      logger.debug(`[EmailEnrichment] Failed to fetch ${url}: ${toErrorMessage(error)}`);
      return null;
    }
  }

  private normalizeUrl(website: string): string | null {
    try {
      let urlStr = website.trim();
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        urlStr = `https://${urlStr}`;
      }
      const parsed = new URL(urlStr);
      // Only allow http/https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.href;
    } catch {
      return null;
    }
  }

  private async logEnrichment(businessId: string, status: string, dataAdded: Record<string, unknown> | null): Promise<void> {
    await this.prisma.enrichmentLog.create({
      data: {
        businessId,
        source: 'website_email_scrape',
        status,
        dataAdded: dataAdded ? JSON.parse(JSON.stringify(dataAdded)) as Record<string, string> : undefined,
      },
    });
  }

  private freshProgress(): EnrichmentProgress {
    return {
      total: 0,
      processed: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      emails: [],
      isRunning: false,
      startedAt: null,
      finishedAt: null,
    };
  }
}
