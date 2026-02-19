import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendError } from '../utils/response.js';

/**
 * Zod validation middleware factory.
 * Validates request body, query, or params against a Zod schema.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      sendError(res, message, 400, 'VALIDATION_ERROR');
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      sendError(res, message, 400, 'VALIDATION_ERROR');
      return;
    }
    req.query = result.data;
    next();
  };
}
