import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

/**
 * Simple in-memory API rate limiter.
 * Limits requests per IP to MAX_REQUESTS per minute.
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = (req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const now = Date.now();

  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (bucket.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    sendError(res, 'Too many requests', 429, 'RATE_LIMITED');
    return;
  }

  bucket.count++;
  next();
}
