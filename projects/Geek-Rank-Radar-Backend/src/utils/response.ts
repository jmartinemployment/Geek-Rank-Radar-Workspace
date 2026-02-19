import type { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

export function sendPaginated<T>(
  res: Response,
  data: T,
  pagination: PaginationMeta,
  statusCode = 200,
): void {
  const body: SuccessResponse<T> = { success: true, data, pagination };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  code?: string,
): void {
  const body: ErrorResponse = {
    success: false,
    error: { message, code },
  };
  res.status(statusCode).json(body);
}
