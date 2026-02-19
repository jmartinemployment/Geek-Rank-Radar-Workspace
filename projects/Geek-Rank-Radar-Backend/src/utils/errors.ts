export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ThrottleError extends AppError {
  constructor(engineId: string) {
    super(`Engine '${engineId}' is throttled`, 429, 'THROTTLED');
    this.name = 'ThrottleError';
  }
}

export class EngineBlockedError extends AppError {
  constructor(engineId: string, resumeAt: Date) {
    super(
      `Engine '${engineId}' is blocked until ${resumeAt.toISOString()}`,
      503,
      'ENGINE_BLOCKED',
    );
    this.name = 'EngineBlockedError';
  }
}
