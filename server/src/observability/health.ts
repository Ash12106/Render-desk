import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getMongoConnectionState } from '../../models/mongo.js';

/** Confirms that the Node process can accept traffic without requiring a database query. */
export function livenessHandler(_req: Request, res: Response) {
  res.json({ status: 'ok', service: 'support-ops-desk', timestamp: new Date().toISOString() });
}

/** Confirms that MongoDB is connected and can answer a lightweight ping. */
export async function databaseReadinessHandler(_req: Request, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return res.status(503).json({ status: 'degraded', database: getMongoConnectionState() });
    }
    await mongoose.connection.db.command({ ping: 1 });
    res.json({ status: 'ok', database: getMongoConnectionState() });
  } catch (_error) {
    res.status(503).json({ status: 'degraded', database: getMongoConnectionState() });
  }
}
