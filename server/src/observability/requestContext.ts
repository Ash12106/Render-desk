import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const suppliedRequestId = req.header('x-request-id');
  req.requestId = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId) ? suppliedRequestId : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function apiRequestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const fields = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    };
    if (res.statusCode >= 500) logger.error('http_request', fields);
    else if (res.statusCode >= 400) logger.warn('http_request', fields);
    else logger.info('http_request', fields);
  });
  next();
}
