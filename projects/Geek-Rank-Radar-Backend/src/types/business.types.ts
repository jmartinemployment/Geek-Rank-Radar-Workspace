export type ReviewVelocity = 'accelerating' | 'stable' | 'slowing' | 'stale';
export type RankingMomentum = 'rising' | 'stable' | 'falling';
export type WebsiteQuality = 'modern' | 'outdated' | 'none';

export interface BusinessMatch {
  businessId: string;
  confidence: number;
  matchType: MatchType;
}

export type MatchType =
  | 'google_place_id'
  | 'normalized_name_location'
  | 'phone'
  | 'fuzzy_name_phone'
  | 'website_domain'
  | 'new';

export interface BusinessFilters {
  categoryId?: string;
  city?: string;
  state?: string;
  isMine?: boolean;
  isCompetitor?: boolean;
  searchEngine?: string;
  minRating?: number;
  hasPhone?: boolean;
  hasWebsite?: boolean;
}

export interface EnrichmentPriority {
  businessId: string;
  priority: number;
  reason: string;
}
