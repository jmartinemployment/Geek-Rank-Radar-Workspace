/**
 * Simple cookie jar for maintaining session cookies across requests.
 * Search engines set consent/tracking cookies — returning them looks more natural.
 */

interface Cookie {
  name: string;
  value: string;
  domain: string;
  expiresAt?: number; // epoch ms
}

export class CookieJar {
  private readonly cookies = new Map<string, Cookie>();

  /**
   * Parse and store cookies from response Set-Cookie headers.
   */
  setCookies(domain: string, setCookieHeaders: string | string[] | undefined): void {
    if (!setCookieHeaders) return;

    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    for (const header of headers) {
      const parsed = this.parseCookie(header, domain);
      if (parsed) {
        this.cookies.set(`${parsed.domain}:${parsed.name}`, parsed);
      }
    }
  }

  /**
   * Get stored cookies as a Cookie header string for the given domain.
   */
  getCookieHeader(domain: string): string | undefined {
    this.pruneExpired();

    const matching: string[] = [];
    for (const cookie of this.cookies.values()) {
      if (domain.endsWith(cookie.domain) || cookie.domain.endsWith(domain)) {
        matching.push(`${cookie.name}=${cookie.value}`);
      }
    }

    return matching.length > 0 ? matching.join('; ') : undefined;
  }

  get size(): number {
    return this.cookies.size;
  }

  clear(): void {
    this.cookies.clear();
  }

  private parseCookie(header: string, defaultDomain: string): Cookie | undefined {
    const parts = header.split(';').map((p) => p.trim());
    if (parts.length === 0) return undefined;

    const nameValue = parts[0];
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex < 1) return undefined;

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();

    let domain = defaultDomain;
    let expiresAt: number | undefined;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part.startsWith('domain=')) {
        domain = parts[i].slice(7).trim().replace(/^\./, '');
      } else if (part.startsWith('max-age=')) {
        const seconds = Number.parseInt(part.slice(8), 10);
        if (!Number.isNaN(seconds)) {
          expiresAt = Date.now() + seconds * 1000;
        }
      } else if (part.startsWith('expires=')) {
        const dateStr = parts[i].slice(8).trim();
        const ts = Date.parse(dateStr);
        if (!Number.isNaN(ts)) {
          expiresAt = ts;
        }
      }
    }

    return { name, value, domain, expiresAt };
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, cookie] of this.cookies.entries()) {
      if (cookie.expiresAt && cookie.expiresAt < now) {
        this.cookies.delete(key);
      }
    }
  }
}
