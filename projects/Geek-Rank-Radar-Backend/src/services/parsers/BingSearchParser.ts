import type {
  GeoPoint,
  SERPResult,
  ParsedBusiness,
  OrganicResult,
} from '../../types/engine.types.js';
import { normalizePhone } from '../../utils/phone.js';

interface BingWebPage {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
}

interface BingPlace {
  name: string;
  url?: string;
  phone?: string;
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    streetAddress?: string;
    neighborhood?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
  entityPresentationInfo?: {
    entityTypeDisplayHint?: string;
  };
}

interface BingSearchResponse {
  webPages?: {
    value: BingWebPage[];
    totalEstimatedMatches?: number;
  };
  places?: {
    value: BingPlace[];
  };
}

/**
 * Parses Bing Web Search API JSON responses into standardized SERPResult.
 */
export class BingSearchParser {
  parse(
    data: BingSearchResponse,
    query: string,
    location: GeoPoint,
    responseTimeMs: number,
  ): SERPResult {
    const businesses = this.parsePlaces(data.places?.value ?? []);
    const organicResults = this.parseWebPages(data.webPages?.value ?? []);

    return {
      engineId: 'bing_api',
      query,
      location,
      timestamp: new Date(),
      businesses,
      organicResults,
      metadata: {
        totalResults: data.webPages?.totalEstimatedMatches,
        captchaDetected: false,
        responseTimeMs,
      },
    };
  }

  private parsePlaces(places: BingPlace[]): ParsedBusiness[] {
    return places.map((place, index) => ({
      name: place.name,
      address: place.address?.streetAddress ?? undefined,
      city: place.address?.addressLocality ?? undefined,
      state: place.address?.addressRegion ?? undefined,
      zip: place.address?.postalCode ?? undefined,
      phone: normalizePhone(place.phone) ?? undefined,
      website: place.url ?? undefined,
      lat: place.geo?.latitude,
      lng: place.geo?.longitude,
      primaryType: place.entityPresentationInfo?.entityTypeDisplayHint ?? undefined,
      resultType: 'local_pack' as const,
      rankPosition: index + 1,
    }));
  }

  private parseWebPages(pages: BingWebPage[]): OrganicResult[] {
    return pages.map((page, index) => {
      let domain = '';
      try {
        domain = new URL(page.url).hostname;
      } catch {
        domain = page.url;
      }

      return {
        position: index + 1,
        title: page.name,
        url: page.url,
        domain,
        snippet: page.snippet,
        resultType: 'organic' as const,
      };
    });
  }
}
