export interface RankTrendPoint {
  date: string;
  engineId: string;
  keyword: string;
  serviceArea: string;
  avgPosition: number;
  bestPosition: number;
  worstPosition: number;
}

export interface GeoHeatmapCell {
  row: number;
  col: number;
  lat: number;
  lng: number;
  rankPosition: number | null;
  businessName: string | null;
}

export interface GapAnalysisResult {
  type: 'geographic' | 'keyword' | 'cross_engine';
  description: string;
  currentRank: number | null;
  competitorRank: number | null;
  serviceArea?: string;
  keyword?: string;
  engine?: string;
  opportunity: 'high' | 'medium' | 'low';
}

export interface CompetitorComparison {
  businessId: string;
  businessName: string;
  avgRank: Record<string, number>;
  keywordsRanked: number;
  areasPresent: number;
  reviewCount: number;
  rating: number | null;
  reviewVelocity: string | null;
  rankingMomentum: string | null;
}

export interface MarketOverview {
  categoryId: string;
  categoryName: string;
  serviceAreaId: string;
  serviceAreaName: string;
  totalBusinesses: number;
  avgRating: number | null;
  topBusinesses: Array<{
    id: string;
    name: string;
    avgRank: number;
    rating: number | null;
    reviewCount: number;
  }>;
}

export interface RankTrendFilters {
  businessId: string;
  keyword?: string;
  serviceAreaId?: string;
  engineId?: string;
  startDate?: string;
  endDate?: string;
}

export interface GeoHeatmapFilters {
  keyword: string;
  serviceAreaId: string;
  engineId: string;
  scanId?: string;
}
