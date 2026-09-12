import type { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../observability/logger.js';

/** Convert expected validation and persistence failures into safe API responses. */
export function handleApiError(res: Response, req: Request, err: unknown) {
  const error = err as { name?: string; message?: string; code?: number; statusCode?: number };
  if (
    error.name === 'MongooseError' ||
    error.name === 'MongoNetworkError' ||
    error.name === 'MongoServerSelectionError' ||
    error.name === 'MongoNotConnectedError' ||
    error.message?.includes('buffering timed out')
  ) {
    logger.warn('database_request_failed', { requestId: req.requestId, path: req.path });
    return res.status(503).json({ success: false, message: 'Service temporarily unavailable (database offline)', data: null });
  }

  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: 'An account with these details already exists.', data: null });
  }
  if (error.name === 'CastError' || error.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: 'Invalid request data.', data: null });
  }
  if (err instanceof z.ZodError) {
    const fields: Record<string, string> = {};
    err.issues.forEach((issue) => {
      if (issue.path.length > 0) fields[issue.path[0] as string] = issue.message;
    });
    return res.status(400).json({ success: false, message: 'Validation failed', fields, data: null });
  }
  if ((error.statusCode === 403 || error.statusCode === 409) && error.message) {
    return res.status(error.statusCode).json({ success: false, message: error.message, data: null });
  }

  logger.error('unhandled_request_error', {
    requestId: req.requestId,
    path: req.path,
    errorName: error.name || 'UnknownError',
  });
  return res.status(500).json({ success: false, message: 'Unexpected server failure', data: null });
}
