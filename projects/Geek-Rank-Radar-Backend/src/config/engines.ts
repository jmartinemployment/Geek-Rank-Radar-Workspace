export interface ThrottleConfig {
  minDelayMs: number;
  maxDelayMs: number;
  maxPerHour: number;
  maxPerDay: number;
  pauseOnCaptchaHours: number;
  jitterMs: number;
  backoffOnError: number;
}

export interface EngineConfig {
  engineId: string;
  engineName: string;
  throttle: ThrottleConfig;
  isLegitimateApi: boolean;
  requiresApiKey: boolean;
  apiKeyEnv?: string;
  /** Google engines share reputation — group them */
  reputationGroup?: string;
}

export const ENGINE_CONFIGS: Record<string, EngineConfig> = {
  google_search: {
    engineId: 'google_search',
    engineName: 'Google Web Search',
    throttle: {
      minDelayMs: 8000,
      maxDelayMs: 18000,
      maxPerHour: 40,
      maxPerDay: 200,
      pauseOnCaptchaHours: 24,
      jitterMs: 500,
      backoffOnError: 2,
    },
    isLegitimateApi: false,
    requiresApiKey: false,
    reputationGroup: 'google',
  },
  google_maps: {
    engineId: 'google_maps',
    engineName: 'Google Maps',
    throttle: {
      minDelayMs: 8000,
      maxDelayMs: 18000,
      maxPerHour: 40,
      maxPerDay: 200,
      pauseOnCaptchaHours: 24,
      jitterMs: 500,
      backoffOnError: 2,
    },
    isLegitimateApi: false,
    requiresApiKey: false,
    reputationGroup: 'google',
  },
  google_local: {
    engineId: 'google_local',
    engineName: 'Google Local Finder',
    throttle: {
      minDelayMs: 8000,
      maxDelayMs: 18000,
      maxPerHour: 40,
      maxPerDay: 200,
      pauseOnCaptchaHours: 24,
      jitterMs: 500,
      backoffOnError: 2,
    },
    isLegitimateApi: false,
    requiresApiKey: false,
    reputationGroup: 'google',
  },
  bing_api: {
    engineId: 'bing_api',
    engineName: 'Bing Web Search API',
    throttle: {
      minDelayMs: 1000,
      maxDelayMs: 3000,
      maxPerHour: 200,
      maxPerDay: 900,
      pauseOnCaptchaHours: 0,
      jitterMs: 200,
      backoffOnError: 1.5,
    },
    isLegitimateApi: true,
    requiresApiKey: true,
    apiKeyEnv: 'BING_SEARCH_API_KEY',
  },
  bing_local: {
    engineId: 'bing_local',
    engineName: 'Bing Local / Places',
    throttle: {
      minDelayMs: 5000,
      maxDelayMs: 12000,
      maxPerHour: 60,
      maxPerDay: 300,
      pauseOnCaptchaHours: 12,
      jitterMs: 500,
      backoffOnError: 2,
    },
    isLegitimateApi: false,
    requiresApiKey: false,
  },
  duckduckgo: {
    engineId: 'duckduckgo',
    engineName: 'DuckDuckGo',
    throttle: {
      minDelayMs: 8000,
      maxDelayMs: 15000,
      maxPerHour: 60,
      maxPerDay: 300,
      pauseOnCaptchaHours: 1,
      jitterMs: 500,
      backoffOnError: 2,
    },
    isLegitimateApi: false,
    requiresApiKey: false,
  },
  google_places_api: {
    engineId: 'google_places_api',
    engineName: 'Google Places API',
    throttle: {
      minDelayMs: 200,
      maxDelayMs: 500,
      maxPerHour: 500,
      maxPerDay: 5000,
      pauseOnCaptchaHours: 0,
      jitterMs: 200,
      backoffOnError: 1.5,
    },
    isLegitimateApi: true,
    requiresApiKey: true,
    apiKeyEnv: 'GOOGLE_PLACES_API_KEY',
  },
};

/** Combined daily limit for all Google scraping engines */
export const GOOGLE_COMBINED_DAILY_LIMIT = 200;
