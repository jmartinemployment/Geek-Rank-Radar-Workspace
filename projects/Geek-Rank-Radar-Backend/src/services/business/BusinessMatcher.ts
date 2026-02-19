import type { PrismaClient, Business } from '../../generated/prisma/client/index.js';
import type { ParsedBusiness } from '../../types/engine.types.js';
import type { BusinessMatch } from '../../types/business.types.js';
import { normalizeName, normalizeDomain, levenshteinDistance } from '../../utils/text.js';
import { normalizePhone } from '../../utils/phone.js';
import { haversineDistance } from '../../utils/geo.js';
import { logger } from '../../config/logger.js';

/**
 * Business entity resolution and deduplication.
 * Matches incoming parsed businesses against existing database records
 * to prevent duplicate entries.
 */
export class BusinessMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Find or create a business entity from a parsed search result.
   * Returns the business ID and match metadata.
   */
  async findOrCreate(
    parsed: ParsedBusiness,
    engineId: string,
    categoryId?: string,
  ): Promise<BusinessMatch> {
    const normalized = normalizeName(parsed.name);

    // 1. Exact Google Place ID match (100% confidence)
    if (parsed.googlePlaceId) {
      const existing = await this.prisma.business.findUnique({
        where: { googlePlaceId: parsed.googlePlaceId },
      });
      if (existing) {
        await this.updateLastSeen(existing.id, parsed, engineId);
        return { businessId: existing.id, confidence: 100, matchType: 'google_place_id' };
      }
    }

    // 2. Phone number match (90% confidence)
    const normalizedPhone = normalizePhone(parsed.phone ?? null);
    if (normalizedPhone) {
      const phoneMatch = await this.prisma.business.findFirst({
        where: { phone: normalizedPhone },
      });
      if (phoneMatch) {
        await this.updateLastSeen(phoneMatch.id, parsed, engineId);
        return { businessId: phoneMatch.id, confidence: 90, matchType: 'phone' };
      }
    }

    // 3. Normalized name + location within 50m (95% confidence)
    if (parsed.lat !== undefined && parsed.lng !== undefined) {
      const nameMatches = await this.prisma.business.findMany({
        where: { normalizedName: normalized },
      });
      for (const candidate of nameMatches) {
        if (candidate.lat !== null && candidate.lng !== null) {
          const distance = haversineDistance(
            Number(candidate.lat),
            Number(candidate.lng),
            parsed.lat,
            parsed.lng,
          );
          // 50 meters ≈ 0.031 miles
          if (distance < 0.031) {
            await this.updateLastSeen(candidate.id, parsed, engineId);
            return { businessId: candidate.id, confidence: 95, matchType: 'normalized_name_location' };
          }
        }
      }
    }

    // 3.5. Fuzzy name + phone (85% confidence)
    // Catches slight name variations across engines (e.g., "Joe's Pizza" vs "Joes Pizza")
    if (normalizedPhone) {
      const phoneMatches = await this.prisma.business.findMany({
        where: { phone: normalizedPhone },
      });
      for (const candidate of phoneMatches) {
        const candidateNormalized = candidate.normalizedName;
        if (candidateNormalized && levenshteinDistance(normalized, candidateNormalized) <= 3) {
          await this.updateLastSeen(candidate.id, parsed, engineId);
          return { businessId: candidate.id, confidence: 85, matchType: 'fuzzy_name_phone' };
        }
      }
    }

    // 4. Website domain match + same city (80% confidence)
    const parsedDomain = normalizeDomain(parsed.website);
    if (parsedDomain && parsed.city) {
      const domainMatches = await this.prisma.business.findMany({
        where: {
          city: { equals: parsed.city, mode: 'insensitive' },
          website: { not: null },
        },
      });
      for (const candidate of domainMatches) {
        const candidateDomain = normalizeDomain(candidate.website);
        if (candidateDomain === parsedDomain) {
          await this.updateLastSeen(candidate.id, parsed, engineId);
          return { businessId: candidate.id, confidence: 80, matchType: 'website_domain' };
        }
      }
    }

    // 5. No match — create new business
    const business = await this.createBusiness(parsed, normalized, normalizedPhone, engineId, categoryId);
    logger.info(`[BusinessMatcher] Created new business: "${parsed.name}" (${business.id})`);

    return { businessId: business.id, confidence: 0, matchType: 'new' };
  }

  private async createBusiness(
    parsed: ParsedBusiness,
    normalizedName: string,
    phone: string | null,
    engineId: string,
    categoryId?: string,
  ): Promise<Business> {
    const isBing = engineId.startsWith('bing');

    return this.prisma.business.create({
      data: {
        name: parsed.name,
        normalizedName,
        phone,
        website: parsed.website ?? null,
        address: parsed.address ?? null,
        city: parsed.city ?? null,
        state: parsed.state ?? null,
        zip: parsed.zip ?? null,
        lat: parsed.lat ?? null,
        lng: parsed.lng ?? null,
        categoryId: categoryId ?? null,
        primaryType: parsed.primaryType ?? null,
        types: parsed.types ?? [],
        googlePlaceId: parsed.googlePlaceId ?? null,
        googleCid: parsed.googleCid ?? null,
        googleMapsUrl: parsed.googleMapsUrl ?? null,
        bingPlaceId: parsed.bingPlaceId ?? null,
        googleRating: !isBing ? parsed.rating ?? null : null,
        googleReviewCount: !isBing ? parsed.reviewCount ?? null : null,
        bingRating: isBing ? parsed.rating ?? null : null,
        bingReviewCount: isBing ? parsed.reviewCount ?? null : null,
        description: parsed.description ?? null,
        priceLevel: parsed.priceLevel ?? null,
        hours: parsed.hours ?? undefined,
        attributes: parsed.attributes ? JSON.parse(JSON.stringify(parsed.attributes)) : undefined,
        serviceOptions: parsed.serviceOptions ?? undefined,
        menuUrl: parsed.menuUrl ?? null,
        orderUrl: parsed.orderUrl ?? null,
        reservationUrl: parsed.reservationUrl ?? null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Update lastSeenAt and merge any new data from the parsed result.
   */
  private async updateLastSeen(
    businessId: string,
    parsed: ParsedBusiness,
    engineId: string,
  ): Promise<void> {
    const isBing = engineId.startsWith('bing');

    const updateData: Record<string, unknown> = {
      lastSeenAt: new Date(),
    };

    // Merge in new data that wasn't previously available
    if (parsed.phone && !isBing) updateData.phone = normalizePhone(parsed.phone);
    if (parsed.website) updateData.website = parsed.website;
    if (parsed.googlePlaceId) updateData.googlePlaceId = parsed.googlePlaceId;
    if (parsed.bingPlaceId) updateData.bingPlaceId = parsed.bingPlaceId;
    if (parsed.lat !== undefined && parsed.lng !== undefined) {
      updateData.lat = parsed.lat;
      updateData.lng = parsed.lng;
    }

    // Update ratings from the appropriate engine
    if (parsed.rating !== undefined) {
      if (isBing) {
        updateData.bingRating = parsed.rating;
        updateData.bingReviewCount = parsed.reviewCount ?? null;
      } else {
        updateData.googleRating = parsed.rating;
        updateData.googleReviewCount = parsed.reviewCount ?? null;
      }
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: updateData,
    });
  }
}
