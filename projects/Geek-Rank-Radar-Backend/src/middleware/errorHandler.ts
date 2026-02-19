import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';
import { logger } from '../config/logger.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn(err.message, { statusCode: err.statusCode, code: err.code });
    sendError(res, err.message, err.statusCode, err.code);
    return;
  }

  if (err instanceof Error) {
    logger.error(err.message, { stack: err.stack });
    sendError(res, 'Internal server error', 500);
    return;
  }

  logger.error('Unknown error', { error: err });
  sendError(res, 'Internal server error', 500);
}
