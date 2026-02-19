import { readFileSync } from 'node:fs';
import { logger } from '../config/logger.js';
import type { AxiosRequestConfig } from 'axios';

interface ProxyEntry {
  url: string;
  failedAt?: Date;
  cooldownUntil?: Date;
}

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Round-robin proxy rotator with failure cooldown.
 * Loads proxies from PROXY_LIST env var (comma-separated) or a file.
 * If no proxies configured, all methods return empty config (direct connection).
 */
export class ProxyRotator {
  private readonly proxies: ProxyEntry[] = [];
  private index = 0;

  constructor() {
    this.loadProxies();
  }

  private loadProxies(): void {
    const proxyList = process.env.PROXY_LIST;
    const proxyFile = process.env.PROXY_FILE;

    if (proxyList) {
      const urls = proxyList.split(',').map((u) => u.trim()).filter(Boolean);
      for (const url of urls) {
        this.proxies.push({ url });
      }
    }

    if (proxyFile) {
      try {
        const content = readFileSync(proxyFile, 'utf-8');
        const lines = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        for (const url of lines) {
          this.proxies.push({ url });
        }
      } catch (error: unknown) {
        logger.warn(`[ProxyRotator] Failed to load proxy file ${proxyFile}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.proxies.length > 0) {
      logger.info(`[ProxyRotator] Loaded ${this.proxies.length} proxies`);
    }
  }

  get size(): number {
    return this.proxies.length;
  }

  get hasProxies(): boolean {
    return this.proxies.length > 0;
  }

  /**
   * Get the next available proxy URL via round-robin.
   * Skips proxies in cooldown. Returns undefined if none available.
   */
  getNext(): string | undefined {
    if (this.proxies.length === 0) return undefined;

    const now = Date.now();
    const startIndex = this.index;

    // Try each proxy in rotation
    for (let i = 0; i < this.proxies.length; i++) {
      const idx = (startIndex + i) % this.proxies.length;
      const proxy = this.proxies[idx];

      if (proxy.cooldownUntil && now < proxy.cooldownUntil.getTime()) {
        continue; // still in cooldown
      }

      this.index = (idx + 1) % this.proxies.length;
      return proxy.url;
    }

    // All proxies in cooldown
    logger.warn('[ProxyRotator] All proxies in cooldown');
    return undefined;
  }

  /**
   * Mark a proxy as failed — puts it in cooldown for 30 minutes.
   */
  markFailed(proxyUrl: string): void {
    const entry = this.proxies.find((p) => p.url === proxyUrl);
    if (entry) {
      entry.failedAt = new Date();
      entry.cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
      logger.warn(`[ProxyRotator] Proxy ${proxyUrl} failed, cooldown until ${entry.cooldownUntil.toISOString()}`);
    }
  }

  /**
   * Build axios request config for the next available proxy.
   * Supports http/https/socks5 proxy URLs.
   * Returns empty object if no proxies configured.
   */
  getAxiosConfig(): Partial<AxiosRequestConfig> {
    const proxyUrl = this.getNext();
    if (!proxyUrl) return {};

    try {
      const parsed = new URL(proxyUrl);
      const protocol = parsed.protocol.replace(':', '');

      if (protocol === 'socks5' || protocol === 'socks4') {
        // For SOCKS proxies, the caller would need socks-proxy-agent
        // For now, log a warning and skip
        logger.debug(`[ProxyRotator] SOCKS proxy not yet supported: ${proxyUrl}`);
        return {};
      }

      return {
        proxy: {
          host: parsed.hostname,
          port: Number.parseInt(parsed.port || '8080', 10),
          protocol: protocol === 'https' ? 'https' : 'http',
          ...(parsed.username ? {
            auth: {
              username: decodeURIComponent(parsed.username),
              password: decodeURIComponent(parsed.password),
            },
          } : {}),
        },
      };
    } catch {
      logger.warn(`[ProxyRotator] Invalid proxy URL: ${proxyUrl}`);
      return {};
    }
  }
}
