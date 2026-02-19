export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GridPoint extends GeoPoint {
  row: number;
  col: number;
}

export type EngineStatus = 'healthy' | 'throttled' | 'blocked' | 'disabled';

export interface EngineState {
  engineId: string;
  status: EngineStatus;
  requestsThisHour: number;
  requestsToday: number;
  lastRequestAt: Date | null;
  blockedUntil: Date | null;
  errorCount: number;
}

export type ResultType =
  | 'local_pack'
  | 'organic'
  | 'maps'
  | 'local_finder'
  | 'knowledge_panel'
  | 'people_also_ask'
  | 'related_searches'
  | 'ads';

export interface SERPResult {
  engineId: string;
  query: string;
  location: GeoPoint;
  timestamp: Date;
  businesses: ParsedBusiness[];
  organicResults: OrganicResult[];
  metadata: SERPMetadata;
}

export interface ParsedBusiness {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  primaryType?: string;
  types?: string[];
  googlePlaceId?: string;
  googleCid?: string;
  googleMapsUrl?: string;
  bingPlaceId?: string;
  description?: string;
  hours?: Record<string, string>;
  attributes?: Record<string, unknown>;
  serviceOptions?: Record<string, boolean>;
  menuUrl?: string;
  orderUrl?: string;
  reservationUrl?: string;
  resultType: ResultType;
  rankPosition: number;
  snippet?: string;
}

export interface OrganicResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sitelinks?: string[];
  resultType: ResultType;
}

export interface SERPMetadata {
  totalResults?: number;
  captchaDetected: boolean;
  responseTimeMs: number;
  rawHtml?: string;
  relatedSearches?: string[];
  peopleAlsoAsk?: string[];
}
