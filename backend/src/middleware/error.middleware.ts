import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import * as Sentry from '@sentry/node';

// Generate request ID for tracking
export function generateRequestId(): string {
  // Use crypto for UUID-like ID if uuid is not available
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Attach request ID to each request
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const requestId = (req as any).requestId || 'unknown';
  
  // Log the error with structured data
  logger.error({ 
    err, 
    path: req.path, 
    method: req.method,
    requestId 
  }, 'Express error handled');

  // Handle typed application errors
  if (err instanceof AppError) {
    // Capture to Sentry for 5xx errors
    if (err.statusCode >= 500) {
      Sentry.captureException(err);
    }

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.field && { field: err.field }),
        requestId,
      },
    });
  }

  // Capture unknown errors to Sentry
  Sentry.captureException(err);

  // Handle standard errors
  const statusCode = (err as any)?.status || (err as any)?.statusCode || 500;
  const message = (err as any)?.message || 'Internal Server Error';

  // In production, hide internal error details
  const errorResponse: any = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : message,
      requestId,
    },
  };

  return res.status(statusCode).json(errorResponse);
}
