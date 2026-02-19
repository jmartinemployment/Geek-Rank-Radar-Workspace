/**
 * Browser fingerprint profiles — UA, Client Hints, and Referer must be consistent.
 * Each profile represents a realistic browser session.
 */

interface BrowserProfile {
  userAgent: string;
  secChUa: string;
  secChUaPlatform: string;
  secChUaMobile: string;
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  platform: 'windows' | 'macos' | 'linux';
}

const PROFILES: readonly BrowserProfile[] = [
  // Chrome 131 on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
    browser: 'chrome',
    platform: 'windows',
  },
  // Chrome 130 on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="130", "Chromium";v="130", "Not_A Brand";v="24"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
    browser: 'chrome',
    platform: 'windows',
  },
  // Chrome 131 on macOS
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"macOS"',
    secChUaMobile: '?0',
    browser: 'chrome',
    platform: 'macos',
  },
  // Chrome 130 on macOS
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="130", "Chromium";v="130", "Not_A Brand";v="24"',
    secChUaPlatform: '"macOS"',
    secChUaMobile: '?0',
    browser: 'chrome',
    platform: 'macos',
  },
  // Edge 131 on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    secChUa: '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
    browser: 'edge',
    platform: 'windows',
  },
  // Edge 130 on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    secChUa: '"Microsoft Edge";v="130", "Chromium";v="130", "Not_A Brand";v="24"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
    browser: 'edge',
    platform: 'windows',
  },
  // Chrome 131 on Linux
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"Linux"',
    secChUaMobile: '?0',
    browser: 'chrome',
    platform: 'linux',
  },
  // Firefox 133 on Windows (no Client Hints — Firefox doesn't send them)
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    secChUa: '',
    secChUaPlatform: '',
    secChUaMobile: '',
    browser: 'firefox',
    platform: 'windows',
  },
  // Firefox 133 on macOS
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
    secChUa: '',
    secChUaPlatform: '',
    secChUaMobile: '',
    browser: 'firefox',
    platform: 'macos',
  },
];

let currentProfileIndex = Math.floor(Math.random() * PROFILES.length);
let requestsSinceRotation = 0;

/**
 * Get a random user agent from the pool.
 */
export function getRandomUserAgent(): string {
  return PROFILES[Math.floor(Math.random() * PROFILES.length)].userAgent;
}

/**
 * Get the current session profile. Rotates after N requests.
 */
export function getCurrentProfile(): BrowserProfile {
  return PROFILES[currentProfileIndex];
}

/**
 * Rotate to a new random profile (called after N requests for session rotation).
 */
export function rotateProfile(): void {
  const oldIndex = currentProfileIndex;
  do {
    currentProfileIndex = Math.floor(Math.random() * PROFILES.length);
  } while (currentProfileIndex === oldIndex && PROFILES.length > 1);
  requestsSinceRotation = 0;
}

/**
 * Track requests and auto-rotate after threshold.
 */
export function trackRequest(rotateAfter = 20): void {
  requestsSinceRotation++;
  if (requestsSinceRotation >= rotateAfter) {
    rotateProfile();
  }
}

/**
 * Build standard browser-like headers for scraped engines.
 * Uses a consistent profile (UA + Client Hints match).
 */
export function buildBrowserHeaders(): Record<string, string> {
  const profile = getCurrentProfile();
  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };

  // Chrome/Edge send Client Hints — Firefox/Safari do not
  if (profile.secChUa) {
    headers['Sec-CH-UA'] = profile.secChUa;
    headers['Sec-CH-UA-Mobile'] = profile.secChUaMobile;
    headers['Sec-CH-UA-Platform'] = profile.secChUaPlatform;
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
  }

  return headers;
}

/**
 * Build engine-specific stealth headers.
 * Includes Client Hints, Referer, and Cache-Control.
 */
export function buildStealthHeaders(engineId: string): Record<string, string> {
  const headers = buildBrowserHeaders();

  // Add plausible referrer
  const referer = buildReferer(engineId);
  if (referer) {
    headers['Referer'] = referer;
    // When we have a referrer, Sec-Fetch-Site should be "same-origin"
    if (headers['Sec-Fetch-Site']) {
      headers['Sec-Fetch-Site'] = 'same-origin';
    }
  }

  headers['Cache-Control'] = 'max-age=0';

  return headers;
}

/**
 * Build a plausible referrer for the engine.
 */
export function buildReferer(engineId: string): string | undefined {
  if (engineId.startsWith('google')) return 'https://www.google.com/';
  if (engineId.startsWith('bing')) return 'https://www.bing.com/';
  // DuckDuckGo: no referrer (DDG users often have referrer disabled)
  return undefined;
}
