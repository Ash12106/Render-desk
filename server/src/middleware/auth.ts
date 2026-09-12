import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../../models/mongo.js';

export type ApplicationRole = 'admin' | 'staff' | 'customer';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    user?: InstanceType<typeof User>;
  }
}

export function requireRole(role: 'staff' | 'customer') {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    const allowed = role === 'staff' ? userRole === 'staff' || userRole === 'admin' : userRole === role;
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'This account does not have access to this area.', data: null });
    }
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.', data: null });
  }
  next();
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required', data: null });
  }

  const token = authHeader.split(' ')[1];
  try {
    if (!mongoose.Types.ObjectId.isValid(token)) {
      return res.status(401).json({ success: false, message: 'Invalid token format', data: null });
    }
    const user = await User.findById(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token', data: null });
    }
    req.user = user;
    next();
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Error verifying authentication', data: null });
  }
}
