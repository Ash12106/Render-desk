import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  connectMongoDB,
  getMongoConnectionState,
  Ticket,
  Customer,
  Comment,
  User,
  AuditLog,
  Notification,
  DeletedTicket,
  PasswordResetToken,
} from './mongo.js';
import { z } from 'zod';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import helmet from 'helmet';
import krawlRouter from './krawl.js';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { OAuth2Client } from 'google-auth-library';
import { queueCustomerStatusNotification, simulateStatusChangeNotification } from './notifications.js';
import { assertValidStatusTransition } from './status.js';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const PORT = Number(process.env.PORT) || 3000;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(googleClientId);
const passwordResetEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
const appBaseUrl = (process.env.APP_BASE_URL || process.env.CORS_ORIGIN || `http://localhost:${PORT}`).replace(
  /\/$/,
  '',
);

function createMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass || !passwordResetEmail) {
    throw new Error('Password reset email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.');
  }
  return nodemailer.createTransport({ host, port, secure: process.env.SMTP_SECURE === 'true', auth: { user, pass } });
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character,
  );
}

const passwordResetRequestSchema = z.object({ email: z.string().trim().email() });
const passwordResetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const ticketSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer.'),
  title: z.string().trim().min(1, 'Enter a ticket title.'),
  description: z.string().trim().min(1, 'Describe the reported issue.'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical'], {
    message: 'Choose a valid priority.',
  }),
  status: z.enum(['Open', 'In Progress', 'Resolved', 'Closed'], {
    message: 'Choose a valid status.',
  }),
  activityStatus: z.enum(['Unread', 'Read', 'Awaiting customer response', 'Awaiting technician response']).optional(),
  dueDate: z
    .string()
    .refine((value) => !value || Number.isFinite(Date.parse(value)), 'Enter a valid due date.')
    .optional()
    .nullable(),
  category: z.enum(['Technical', 'Sales', 'Billing', 'Account', 'Other']).default('Technical'),
  assignmentType: z.enum(['Incident', 'Problem', 'Request', 'Change']).default('Incident'),
  contract: z.string().trim().max(120).optional().default(''),
  ticketForm: z.string().trim().max(120).optional().default(''),
  impact: z.enum(['No Impact', 'Site Down', 'Server Issue', 'Minor', 'Major', 'Crisis']).default('No Impact'),
  productFamily: z.string().trim().max(120).optional().default(''),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        type: z.string().max(120),
        size: z.number().int().positive().max(5_000_000),
        data: z.string().max(7_000_000),
      }),
    )
    .max(5)
    .default([]),
  notifyUser: z.boolean().optional().default(false),
});

const customerRegistrationSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  username: z.string().trim().min(3).max(40),
  password: z.string().min(8),
});

const googleLoginSchema = z.object({
  credential: z.string().min(1),
  accountType: z.enum(['customer', 'staff']).default('customer'),
});

const commentSchema = z.object({
  content: z.string().trim().min(1, 'Enter a comment.'),
  author: z.string().trim().min(1, 'Author name required.'),
});

const phoneSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{10}$/.test(value), 'Phone number must contain exactly 10 digits.')
  .optional();

const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  message: { success: false, message: 'Too many write requests. Try again shortly.', data: null },
});

const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Support Ops Desk API', version: '1.0.0', description: 'Support ticket management API.' },
  servers: [{ url: '/' }],
  tags: [{ name: 'Authentication' }, { name: 'Tickets' }, { name: 'Customers' }, { name: 'Comments' }],
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Log in',
        responses: { '200': { description: 'Authenticated user' }, '401': { description: 'Invalid credentials' } },
      },
    },
    '/api/customer-auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a customer account',
        responses: { '201': { description: 'Customer account created' } },
      },
    },
    '/api/auth/google': {
      post: {
        tags: ['Authentication'],
        summary: 'Sign in or register a customer with Google',
        responses: {
          '200': { description: 'Authenticated customer' },
          '401': { description: 'Invalid Google credential' },
        },
      },
    },
    '/api/tickets': {
      get: { tags: ['Tickets'], summary: 'List tickets', responses: { '200': { description: 'Paginated tickets' } } },
      post: { tags: ['Tickets'], summary: 'Create a ticket', responses: { '201': { description: 'Created ticket' } } },
    },
    '/api/tickets/{id}': {
      get: {
        tags: ['Tickets'],
        summary: 'Get a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Ticket details' }, '404': { description: 'Not found' } },
      },
      put: {
        tags: ['Tickets'],
        summary: 'Update a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated ticket' } },
      },
      delete: {
        tags: ['Tickets'],
        summary: 'Delete a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/api/tickets/{id}/comments': {
      post: {
        tags: ['Comments'],
        summary: 'Add a comment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Created comment' } },
      },
    },
    '/api/customers': {
      get: { tags: ['Customers'], summary: 'List customers', responses: { '200': { description: 'Customers' } } },
    },
  },
};

async function withTransaction<T>(operation: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function requireRole(role: 'staff' | 'customer') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userRole = (req as any).user?.role;
    const allowed = role === 'staff' ? userRole === 'staff' || userRole === 'admin' : userRole === role;
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: 'This account does not have access to this area.', data: null });
    }
    next();
  };
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.', data: null });
  }
  next();
}

// Basic authentication middleware
const authMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    // attach user to req
    (req as any).user = user;
    next();
  } catch (_err) {
    return res.status(500).json({ success: false, message: 'Error verifying authentication', data: null });
  }
};

export async function buildApp() {
  const app = express();
  // Render sits in front of the app and supplies one X-Forwarded-For proxy hop.
  app.set('trust proxy', 1);

  const configuredCorsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(configuredCorsOrigins?.length ? cors({ origin: configuredCorsOrigins }) : cors());
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                'script-src': ["'self'", 'https://accounts.google.com'],
                'frame-src': ["'self'", 'https://accounts.google.com', 'https://accounts.googleusercontent.com'],
                'connect-src': ["'self'", 'https://accounts.google.com'],
                'img-src': ["'self'", 'data:', 'https:'],
              },
            }
          : false,
    }),
  );
  app.use(express.json({ limit: '40mb' }));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use('/api/tickets', mutationLimiter);

  app.get('/api/health/db', async (_req, res) => {
    try {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        return res.status(503).json({ status: 'degraded', database: getMongoConnectionState() });
      }
      await mongoose.connection.db.command({ ping: 1 });
      res.json({ status: 'ok', database: getMongoConnectionState() });
    } catch (_error) {
      res.status(503).json({ status: 'degraded', database: getMongoConnectionState() });
    }
  });

  app.get('/api/auth/config', (_req, res) => {
    res.json({ googleClientId: googleClientId || null });
  });

  app.post('/api/auth/forgot-password', mutationLimiter, async (req, res) => {
    try {
      const { email } = passwordResetRequestSchema.parse(req.body);
      const normalizedEmail = email.toLowerCase();
      const customer = await Customer.findOne({ email: normalizedEmail });
      const user =
        (await User.findOne({ email: normalizedEmail, role: { $in: ['admin', 'staff'] } })) ||
        (customer ? await User.findOne({ customerId: customer._id, role: 'customer' }) : null);

      if (!user) {
        return res.status(202).json({
          success: true,
          message: 'If an account exists for that email, a reset link has been sent.',
        });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await PasswordResetToken.deleteMany({ userId: user._id });
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}`;
      const safeResetUrl = escapeHtml(resetUrl);
      try {
        await createMailer().sendMail({
          from: passwordResetEmail,
          to: normalizedEmail,
          subject: 'Reset your Support Desk password',
          text: `Reset your Support Desk password using this link (valid for 1 hour): ${resetUrl}`,
          html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f0e8;color:#17202b;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:40px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#fffdf8;border:2px solid #17202b;border-radius:8px;box-shadow:8px 8px 0 #17202b;overflow:hidden;">
        <div style="padding:28px 32px;border-bottom:2px solid #17202b;background:#f4f0e8;">
          <p style="margin:0 0 10px;color:#5c6673;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Support Desk</p>
          <h1 style="margin:0;font-size:28px;line-height:1.2;">Reset your password</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">We received a request to reset the password for your Support Desk account.</p>
          <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#5c6673;">This secure link expires in 1 hour and can only be used once.</p>
          <a href="${safeResetUrl}" style="display:inline-block;padding:14px 22px;background:#17202b;color:#ffffff;text-decoration:none;border-radius:6px;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Reset password</a>
          <div style="margin-top:30px;padding-top:20px;border-top:1px solid #d8d2c8;">
            <p style="margin:0 0 8px;color:#5c6673;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Button not working?</p>
            <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.5;"><a href="${safeResetUrl}" style="color:#17202b;">${safeResetUrl}</a></p>
          </div>
          <p style="margin:28px 0 0;color:#5c6673;font-size:12px;line-height:1.5;">If you did not request this reset, you can safely ignore this email.</p>
        </div>
      </div>
      <p style="max-width:560px;margin:22px auto 0;color:#5c6673;text-align:center;font-family:monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Secure account access</p>
    </div>
  </body>
</html>`,
        });
      } catch (mailError) {
        await PasswordResetToken.deleteOne({ tokenHash });
        throw mailError;
      }

      res.status(202).json({
        success: true,
        message: 'If an account exists for that email, a reset link has been sent.',
      });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/auth/reset-password', mutationLimiter, async (req, res) => {
    try {
      const { token, password } = passwordResetSchema.parse(req.body);
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const resetToken = await PasswordResetToken.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
      if (!resetToken) {
        return res.status(400).json({ success: false, message: 'This reset link is invalid or expired.', data: null });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.findByIdAndUpdate(resetToken.userId, { passwordHash }, { new: true });
      await PasswordResetToken.deleteOne({ _id: resetToken._id });
      if (!user)
        return res.status(400).json({ success: false, message: 'This reset link is invalid or expired.', data: null });
      res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/customer-auth/register', mutationLimiter, async (req, res) => {
    try {
      const data = customerRegistrationSchema.parse(req.body);
      const existingUser = await User.findOne({ username: data.username });
      if (existingUser)
        return res.status(409).json({ success: false, message: 'Username is already in use.', data: null });
      const existingCustomer = await Customer.findOne({ email: data.email.toLowerCase() });
      if (existingCustomer)
        return res.status(409).json({ success: false, message: 'A customer already uses this email.', data: null });
      const passwordHash = await bcrypt.hash(data.password, 12);
      const account = await withTransaction(async (session) => {
        const [customer] = await Customer.create(
          [
            {
              name: data.name,
              email: data.email.toLowerCase(),
              customerCode: `CUST-${new mongoose.Types.ObjectId().toString().toUpperCase()}`,
            },
          ],
          { session },
        );
        const [user] = await User.create(
          [{ username: data.username, passwordHash, role: 'customer', customerId: customer._id }],
          { session },
        );
        return user;
      });
      res.status(201).json(account);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/auth/google', mutationLimiter, async (req, res) => {
    try {
      const { credential, accountType } = googleLoginSchema.parse(req.body);
      if (!googleClientId) {
        return res.status(503).json({ success: false, message: 'Google login is not configured.', data: null });
      }
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        return res.status(401).json({ success: false, message: 'Google account could not be verified.', data: null });
      }

      const account = await withTransaction(async (session) => {
        const email = payload.email!.toLowerCase();
        const targetRoles: ('staff' | 'admin' | 'customer')[] =
          accountType === 'staff' ? ['staff', 'admin'] : ['customer'];
        const existingGoogleUser = await User.findOne({
          googleId: payload.sub,
          role: { $in: targetRoles },
        } as any).session(session);
        if (existingGoogleUser) {
          existingGoogleUser.email = email;
          await existingGoogleUser.save({ session });
          return existingGoogleUser;
        }

        if (accountType === 'staff') {
          const staffAccount = await User.findOne({ email, role: { $in: ['staff', 'admin'] } }).session(session);
          if (!staffAccount) {
            const error = new Error(
              'Ask an administrator to create your staff account before using Google sign-in.',
            ) as Error & {
              statusCode?: number;
            };
            error.statusCode = 403;
            throw error;
          }
          staffAccount.googleId = payload.sub;
          staffAccount.email = email;
          await staffAccount.save({ session });
          return staffAccount;
        }

        let customer = await Customer.findOne({ email }).session(session);
        if (!customer) {
          [customer] = await Customer.create([{ name: payload.name || email.split('@')[0], email }], { session });
        }

        const existingCustomerUser = await User.findOne({ customerId: customer._id, role: 'customer' }).session(
          session,
        );
        if (existingCustomerUser) {
          existingCustomerUser.googleId = payload.sub;
          await existingCustomerUser.save({ session });
          return existingCustomerUser;
        }

        const [createdUser] = await User.create(
          [
            {
              username: `google_${payload.sub.slice(0, 24)}`,
              passwordHash: await bcrypt.hash(new mongoose.Types.ObjectId().toString(), 12),
              role: 'customer',
              customerId: customer._id,
              googleId: payload.sub,
            },
          ],
          { session },
        );
        return createdUser;
      });

      res.json(account);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // API Error handler helper
  const handleApiError = (res: express.Response, req: express.Request, err: any) => {
    if (
      err.name === 'MongooseError' ||
      err.name === 'MongoNetworkError' ||
      err.name === 'MongoServerSelectionError' ||
      err.name === 'MongoNotConnectedError' ||
      (err.message && err.message.includes('buffering timed out'))
    ) {
      console.warn('Database unavailable — request failed');
      return res
        .status(503)
        .json({ success: false, message: 'Service temporarily unavailable (database offline)', data: null });
    }

    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: 'An account with these details already exists.', data: null });
    }
    if (err?.name === 'CastError' || err?.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Invalid request data.', data: null });
    }
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      err.issues.forEach((e) => {
        if (e.path.length > 0) {
          fields[e.path[0] as string] = e.message;
        }
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        fields,
        data: null,
      });
    }
    if (err instanceof Error && 'statusCode' in err && (err.statusCode === 403 || err.statusCode === 409)) {
      return res.status(err.statusCode).json({ success: false, message: err.message, data: null });
    }
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Unexpected server failure',
      data: null,
    });
  };

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = z
        .object({
          username: z.string().trim().min(1),
          password: z.string().min(1),
        })
        .parse(req.body);
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials', data: null });
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials', data: null });
      }
      res.json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // Authenticate API requests before mounting routes that use the current user.
  app.use('/api', authMiddleware);
  app.use(krawlRouter);

  app.get('/api/profile', async (req, res) => {
    try {
      const user = await User.findById((req as any).user._id).populate('customerId');
      if (!user) return res.status(404).json({ success: false, message: 'Profile not found.', data: null });
      res.json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/profile/google-link', mutationLimiter, async (req, res) => {
    try {
      const { credential } = googleLoginSchema.pick({ credential: true }).parse(req.body);
      if (!googleClientId) {
        return res.status(503).json({ success: false, message: 'Google login is not configured.', data: null });
      }

      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        return res.status(401).json({ success: false, message: 'Google account could not be verified.', data: null });
      }

      const currentUser = (req as any).user;
      if (!['staff', 'admin'].includes(currentUser.role)) {
        return res.status(403).json({ success: false, message: 'Staff account required.', data: null });
      }

      const existingLink = await User.findOne({ googleId: payload.sub, _id: { $ne: currentUser._id } });
      if (existingLink) {
        return res.status(409).json({
          success: false,
          message: 'This Google account is already linked to another account.',
          data: null,
        });
      }

      const linkedUser = await User.findByIdAndUpdate(
        currentUser._id,
        { googleId: payload.sub, email: payload.email.toLowerCase() },
        { new: true },
      );
      if (!linkedUser) return res.status(404).json({ success: false, message: 'Profile not found.', data: null });
      res.json(linkedUser);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/profile', mutationLimiter, async (req, res) => {
    try {
      const data = z
        .object({
          displayName: z.string().trim().min(2),
          email: z.string().email(),
          phone: phoneSchema,
        })
        .strict()
        .parse(req.body);
      const user = await User.findByIdAndUpdate((req as any).user._id, data, { returnDocument: 'after' });
      if (!user) return res.status(404).json({ success: false, message: 'Profile not found.', data: null });
      res.json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/profile/availability', mutationLimiter, async (req, res) => {
    try {
      if ((req as any).user?.role !== 'staff') {
        return res.status(403).json({ success: false, message: 'Only staff can update availability.', data: null });
      }
      const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
      const user = await User.findOneAndUpdate(
        { _id: (req as any).user._id, role: 'staff' },
        { $set: { isAvailable } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!user) return res.status(404).json({ success: false, message: 'Staff profile not found.', data: null });
      res.json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const users = await User.find({ role: { $in: ['admin', 'staff'] } })
        .sort({ createdAt: 1 })
        .lean();
      const metrics = await Promise.all(
        users.map(async (user) => {
          const { passwordHash: _passwordHash, googleId: _googleId, _id, __v: _version, ...safeUser } = user as any;
          return {
            ...safeUser,
            id: _id.toString(),
            joiningDate: user.createdAt,
            working: await Ticket.countDocuments({
              assignedTo: _id,
              status: { $in: ['Open', 'In Progress'] },
              deletedAt: null,
            }),
            solved: await Ticket.countDocuments({
              assignedTo: _id,
              status: { $in: ['Resolved', 'Closed'] },
              deletedAt: null,
            }),
          };
        }),
      );
      res.json(metrics);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.get('/api/admin/deleted-tickets', requireAdmin, async (_req, res) => {
    try {
      const deletedTickets = await DeletedTicket.find().sort({ deletedAt: -1 });
      res.json(deletedTickets);
    } catch (err) {
      handleApiError(res, _req, err);
    }
  });

  app.post('/api/admin/deleted-tickets/:id/restore', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }

      const restoredTicket = await withTransaction(async (session) => {
        const archivedTicket = await DeletedTicket.findById(req.params.id).session(session);
        if (!archivedTicket) return null;

        const ticketData = archivedTicket.toObject();
        delete (ticketData as any).deletedBy;
        delete (ticketData as any).deletedAt;
        delete (ticketData as any).__v;
        const [ticket] = await Ticket.create([ticketData], { session });
        await DeletedTicket.deleteOne({ _id: archivedTicket._id }, { session });
        await AuditLog.create(
          [
            {
              ticketId: ticket._id,
              action: 'RESTORED',
              details: 'Ticket restored from deleted ticket archive',
              author: (req as any).user?.username || 'System',
            },
          ],
          { session },
        );
        return ticket;
      });

      if (!restoredTicket)
        return res.status(404).json({ success: false, message: 'Deleted ticket not found', data: null });
      res.json(restoredTicket);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/admin/users', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      const data = z
        .object({
          username: z.string().trim().min(3),
          password: z.string().min(8),
          displayName: z.string().trim().min(2),
          email: z.string().email(),
          phone: phoneSchema,
          team: z.string().trim().min(1),
          branch: z.string().trim().min(1),
          role: z.enum(['admin', 'staff']).default('staff'),
        })
        .parse(req.body);
      const passwordHash = await bcrypt.hash(data.password, 12);
      const user = await User.create({ ...data, passwordHash });
      res.status(201).json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/admin/users/:id/role', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      const { role } = z.object({ role: z.enum(['admin', 'staff']) }).parse(req.body);
      const user = await User.findOneAndUpdate(
        { _id: req.params.id, role: { $in: ['admin', 'staff'] } },
        { role },
        { returnDocument: 'after' },
      );
      if (!user) return res.status(404).json({ success: false, message: 'Staff account not found.', data: null });
      res.json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/admin/users/:id/details', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      const data = z
        .object({
          displayName: z.string().trim().min(2),
          email: z.string().email(),
          phone: phoneSchema,
          team: z.string().trim().min(1),
          branch: z.string().trim().min(1),
        })
        .parse(req.body);
      const user = await User.findOneAndUpdate({ _id: req.params.id, role: { $in: ['admin', 'staff'] } }, data, {
        returnDocument: 'after',
      });
      if (!user) return res.status(404).json({ success: false, message: 'Staff account not found.', data: null });
      res.json(user);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/admin/tickets/:id/assignment', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      const { assignedTo, assignedGroup } = z
        .object({ assignedTo: z.string().nullable(), assignedGroup: z.string().trim().min(1).nullable() })
        .parse(req.body);
      if (assignedTo && !mongoose.Types.ObjectId.isValid(assignedTo))
        return res.status(400).json({ success: false, message: 'Invalid staff account.', data: null });
      if (assignedTo) {
        const staff = await User.findOne({ _id: assignedTo, role: 'staff' });
        if (!staff) return res.status(400).json({ success: false, message: 'Choose a staff account.', data: null });
        if (!staff.isAvailable)
          return res.status(409).json({ success: false, message: 'This staff member is unavailable.', data: null });
      }
      const ticket = await Ticket.findOneAndUpdate(
        { _id: req.params.id, deletedAt: null },
        { assignedTo, assignedGroup: assignedGroup || '' },
        { returnDocument: 'after' },
      ).populate('assignedTo', 'displayName username team branch');
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.', data: null });
      res.json(ticket);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/tickets/:id/activity-status', mutationLimiter, requireRole('staff'), async (req, res) => {
    try {
      const { activityStatus } = z
        .object({
          activityStatus: z.enum(['Unread', 'Read', 'Awaiting customer response', 'Awaiting technician response']),
        })
        .parse(req.body);
      const filter: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
      if ((req as any).user?.role === 'staff') filter.assignedTo = (req as any).user._id;
      const ticket = await Ticket.findOneAndUpdate(filter, { $set: { activityStatus } }, { returnDocument: 'after' })
        .populate('customerId', 'name email')
        .populate('assignedTo', 'displayName username team branch');
      if (!ticket)
        return res
          .status(404)
          .json({ success: false, message: 'Ticket not found or not assigned to you.', data: null });
      await AuditLog.create({
        ticketId: ticket._id,
        action: 'ACTIVITY_STATUS_CHANGE',
        details: `Activity status changed to ${activityStatus}`,
        author: (req as any).user?.username || 'System',
      });
      res.json({
        ...ticket.toJSON(),
        customerId: (ticket.customerId as any)?.id,
        customerName: (ticket.customerId as any)?.name,
        customerEmail: (ticket.customerId as any)?.email,
        assignedTo: (ticket.assignedTo as any)?.id || null,
        assignedStaffName: (ticket.assignedTo as any)?.displayName || (ticket.assignedTo as any)?.username,
      });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/admin/tickets/assignment', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      const { ticketIds, assignedTo } = z
        .object({ ticketIds: z.array(z.string().min(1)).min(1), assignedTo: z.string().nullable() })
        .parse(req.body);
      const objectIds = ticketIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (objectIds.length !== ticketIds.length) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID.', data: null });
      }
      if (!assignedTo || !mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({ success: false, message: 'Choose a staff member.', data: null });
      }
      const staff = await User.findOne({ _id: assignedTo, role: 'staff' });
      if (!staff) return res.status(400).json({ success: false, message: 'Choose a staff member.', data: null });
      if (!staff.isAvailable)
        return res.status(409).json({ success: false, message: 'This staff member is unavailable.', data: null });
      const result = await Ticket.updateMany(
        { _id: { $in: objectIds }, deletedAt: null },
        { $set: { assignedTo: staff._id, assignedGroup: staff.team || '' } },
      );
      res.json({ success: true, assignedCount: result.modifiedCount, assignedGroup: staff.team || '' });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.get('/api/customer/profile', requireRole('customer'), async (req, res) => {
    try {
      const customer = await Customer.findById((req as any).user.customerId);
      if (!customer)
        return res.status(404).json({ success: false, message: 'Customer profile not found.', data: null });
      res.json(customer);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/customer/profile', mutationLimiter, requireRole('customer'), async (req, res) => {
    try {
      const data = z
        .object({
          name: z.string().trim().min(2),
          email: z.string().email(),
          phone: phoneSchema,
        })
        .parse(req.body);
      const customer = await Customer.findByIdAndUpdate((req as any).user.customerId, data, {
        returnDocument: 'after',
      });
      if (!customer)
        return res.status(404).json({ success: false, message: 'Customer profile not found.', data: null });
      res.json(customer);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.get('/api/customer/tickets', requireRole('customer'), async (req, res) => {
    try {
      const tickets = await Ticket.find({ customerId: (req as any).user.customerId, deletedAt: null }).sort({
        updatedAt: -1,
      });
      res.json(tickets);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.get('/api/customer/tickets/:id/comments', requireRole('customer'), async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }
      const ticket = await Ticket.findOne({
        _id: req.params.id,
        customerId: (req as any).user.customerId,
        deletedAt: null,
      });
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
      const comments = await Comment.find({ ticketId: ticket._id }).sort({ createdAt: 1 });
      res.json(comments);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/customer/tickets/:id/comments', mutationLimiter, requireRole('customer'), async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }
      const ticket = await Ticket.findOne({
        _id: req.params.id,
        customerId: (req as any).user.customerId,
        deletedAt: null,
      });
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
      if (ticket.status === 'Closed') {
        return res
          .status(409)
          .json({ success: false, message: 'Closed tickets cannot receive new comments.', data: null });
      }

      const data = commentSchema.pick({ content: true }).parse(req.body);
      const author = (req as any).user?.username || 'Customer';
      const newComment = await withTransaction(async (session) => {
        const [comment] = await Comment.create([{ ticketId: ticket._id, content: data.content, author }], { session });
        await AuditLog.create(
          [{ ticketId: ticket._id, action: 'COMMENT_ADDED', details: 'Customer added a comment', author }],
          { session },
        );
        return comment;
      });

      res.status(201).json(newComment);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.get('/api/customer/notifications', requireRole('customer'), async (req, res) => {
    try {
      const notifications = await Notification.find({ customerId: (req as any).user.customerId })
        .sort({ createdAt: -1 })
        .limit(50);
      res.json(notifications);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.patch('/api/customer/notifications/:id/read', requireRole('customer'), async (req, res) => {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, customerId: (req as any).user.customerId },
        { readAt: new Date() },
        { returnDocument: 'after' },
      );
      if (!notification)
        return res.status(404).json({ success: false, message: 'Notification not found.', data: null });
      res.json(notification);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.delete('/api/customer/notifications/:id', requireRole('customer'), async (req, res) => {
    try {
      const result = await Notification.deleteOne({ _id: req.params.id, customerId: (req as any).user.customerId });
      if (result.deletedCount === 0)
        return res.status(404).json({ success: false, message: 'Notification not found.', data: null });
      res.status(204).send();
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.delete('/api/customer/notifications', requireRole('customer'), async (req, res) => {
    try {
      const result = await Notification.deleteMany({ customerId: (req as any).user.customerId });
      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.post('/api/customer/tickets', mutationLimiter, requireRole('customer'), async (req, res) => {
    try {
      const data = ticketSchema.parse({
        ...req.body,
        customerId: (req as any).user.customerId.toString(),
        status: 'Open',
      });
      const author = (req as any).user?.username || 'Customer';
      const savedTicket = await withTransaction(async (session) => {
        const [ticket] = await Ticket.create(
          [
            {
              customerId: data.customerId,
              title: data.title,
              description: data.description,
              priority: data.priority,
              status: 'Open',
              category: data.category,
              assignmentType: data.assignmentType,
              contract: data.contract,
              ticketForm: data.ticketForm,
              impact: data.impact,
              productFamily: data.productFamily,
              attachments: data.attachments,
              dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            },
          ],
          { session },
        );
        await AuditLog.create(
          [{ ticketId: ticket._id, action: 'CREATED', details: 'Ticket created by customer', author }],
          { session },
        );
        return ticket;
      });
      res.status(201).json(savedTicket);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  app.use('/api/tickets', requireRole('staff'));
  app.use('/api/customers', requireRole('staff'));

  // GET /api/tickets/stats
  app.get('/api/tickets/stats', async (req, res) => {
    try {
      const statsFilter: Record<string, unknown> = { deletedAt: null };
      if ((req as any).user?.role === 'staff') statsFilter.assignedTo = (req as any).user._id;
      const tickets = await Ticket.find(statsFilter);
      const statusCounts: Record<string, number> = { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
      const priorityCounts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
      const resolutionTimes: Record<string, { totalMs: number; count: number }> = {
        Low: { totalMs: 0, count: 0 },
        Medium: { totalMs: 0, count: 0 },
        High: { totalMs: 0, count: 0 },
        Critical: { totalMs: 0, count: 0 },
      };

      tickets.forEach((t) => {
        if (statusCounts[t.status] !== undefined) statusCounts[t.status]++;
        if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++;

        if (t.status === 'Resolved' || t.status === 'Closed') {
          const createdAt = new Date(t.createdAt as any).getTime();
          const updatedAt = new Date(t.updatedAt as any).getTime();
          const timeToResolve = updatedAt - createdAt;
          if (resolutionTimes[t.priority]) {
            resolutionTimes[t.priority].totalMs += timeToResolve;
            resolutionTimes[t.priority].count += 1;
          }
        }
      });

      const resolution = Object.keys(resolutionTimes).map((priority) => {
        const data = resolutionTimes[priority];
        const avgMs = data.count > 0 ? data.totalMs / data.count : 0;
        const avgHours = parseFloat((avgMs / (1000 * 60 * 60)).toFixed(1));
        return { name: priority, value: avgHours };
      });

      res.json({
        status: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
        priority: Object.entries(priorityCounts).map(([name, value]) => ({ name, value })),
        resolution,
      });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // GET /api/tickets
  app.get('/api/tickets', async (req, res) => {
    try {
      const { search, status, priority, customerId, limit, offset, sort } = req.query;
      const filter: any = { deletedAt: null }; // soft delete filter
      const currentUser = (req as any).user;
      if (currentUser?.role === 'staff') filter.assignedTo = currentUser._id;

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (customerId) filter.customerId = customerId;

      const { limit: parsedLimit, offset: parsedOffset } = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse({ limit, offset });

      const sortObj: Record<string, 1 | -1> = {};
      const requestedSorts = typeof sort === 'string' ? sort.split(',') : [];
      requestedSorts.forEach((sortField) => {
        if (sortField === 'date') sortObj.createdAt = -1;
        if (sortField === 'priority') sortObj.priority = 1;
        if (sortField === 'status') sortObj.status = 1;
      });
      if (Object.keys(sortObj).length === 0) sortObj.updatedAt = -1;

      if (search) {
        const s = search as string;
        // Find customers matching search
        const matchingCustomers = await Customer.find({ name: { $regex: s, $options: 'i' } }).select('_id');
        const customerIds = matchingCustomers.map((c) => c._id);

        filter.$or = [{ title: { $regex: s, $options: 'i' } }, { customerId: { $in: customerIds } }];
      }

      const total = await Ticket.countDocuments(filter);
      const query = Ticket.find(filter)
        .populate('customerId', 'name email')
        .populate('assignedTo', 'displayName username team branch');
      const tickets = await query.sort(sortObj).skip(parsedOffset).limit(parsedLimit).exec();

      const formatted = tickets.map((t) => {
        const json = t.toJSON();
        return {
          ...json,
          customerId: (t.customerId as any)?.id,
          customerName: (t.customerId as any)?.name,
          customerEmail: (t.customerId as any)?.email,
          assignedTo: (t.assignedTo as any)?.id || (t.assignedTo as any)?._id,
        };
      });

      res.json({ tickets: formatted, total });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // GET /api/tickets/:id
  app.get('/api/tickets/:id', async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }

      const ticketFilter: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
      if ((req as any).user?.role === 'staff') ticketFilter.assignedTo = (req as any).user._id;
      const ticket = await Ticket.findOne(ticketFilter)
        .populate('customerId', 'name email')
        .populate('assignedTo', 'displayName username team branch');
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });

      const comments = await Comment.find({ ticketId: ticket._id }).sort({ createdAt: 1 });
      const logs = await AuditLog.find({ ticketId: ticket._id }).sort({ createdAt: 1 });

      const json = ticket.toJSON();
      res.json({
        ticket: {
          ...json,
          customerId: (ticket.customerId as any)?.id,
          customerName: (ticket.customerId as any)?.name,
          customerEmail: (ticket.customerId as any)?.email,
          assignedTo: (ticket.assignedTo as any)?.id || (ticket.assignedTo as any)?._id,
          assignedStaffName: (ticket.assignedTo as any)?.displayName || (ticket.assignedTo as any)?.username,
        },
        comments,
        logs,
      });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // POST /api/tickets
  app.post('/api/tickets', async (req, res) => {
    try {
      const data = ticketSchema.parse(req.body);

      if (!mongoose.Types.ObjectId.isValid(data.customerId)) {
        return res.status(400).json({ success: false, message: 'Invalid customer ID', data: null });
      }

      const customer = await Customer.findById(data.customerId);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found', data: null });
      }

      const author = (req as any).user?.username || 'System';
      const savedTicket = await withTransaction(async (session) => {
        const ticket = await Ticket.create(
          [
            {
              customerId: data.customerId,
              title: data.title,
              description: data.description,
              priority: data.priority,
              status: data.status,
              category: data.category,
              assignmentType: data.assignmentType,
              contract: data.contract,
              ticketForm: data.ticketForm,
              impact: data.impact,
              productFamily: data.productFamily,
              attachments: data.attachments,
              dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
              assignedTo: (req as any).user?.role === 'staff' ? (req as any).user._id : null,
            },
          ],
          { session },
        ).then(([created]) => created);
        await AuditLog.create(
          [
            {
              ticketId: ticket._id,
              action: 'CREATED',
              details: 'Ticket created',
              author,
            },
          ],
          { session },
        );
        return Ticket.findById(ticket._id).session(session).populate('customerId', 'name email');
      });
      const json = savedTicket!.toJSON();
      res.status(201).json({
        ...json,
        customerId: (savedTicket!.customerId as any)?.id,
        customerName: (savedTicket!.customerId as any)?.name,
        customerEmail: (savedTicket!.customerId as any)?.email,
      });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // PUT /api/tickets/bulk-status
  app.put('/api/tickets/bulk-status', async (req, res) => {
    try {
      const schema = z.object({
        ticketIds: z.array(z.string().min(1)),
        status: z.enum(['Open', 'In Progress', 'Resolved', 'Closed']),
      });
      const { ticketIds, status } = schema.parse(req.body);

      if ((req as any).user?.role === 'admin') {
        return res
          .status(403)
          .json({ success: false, message: 'Administrators manage assignments, not ticket status.', data: null });
      }

      const objectIds = ticketIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (objectIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid ticket IDs provided', data: null });
      }

      const author = (req as any).user?.username || 'System';
      const notificationEvents: Array<{
        ticketId: string;
        ticketTitle: string;
        recipient: string;
        oldStatus: string;
        newStatus: string;
      }> = [];
      await withTransaction(async (session) => {
        const ticketsToUpdate = await Ticket.find({ _id: { $in: objectIds }, deletedAt: null })
          .populate('customerId', 'email')
          .session(session);
        ticketsToUpdate.forEach((ticket) => assertValidStatusTransition(ticket.status, status));
        const logs = ticketsToUpdate
          .filter((t) => t.status !== status)
          .map((t) => ({
            ticketId: t._id,
            action: 'STATUS_CHANGE',
            details: `Status changed from ${t.status} to ${status}`,
            author,
          }));
        await Ticket.updateMany({ _id: { $in: objectIds }, deletedAt: null }, { $set: { status } }, { session });
        if (logs.length > 0) {
          await AuditLog.insertMany(logs, { session });
          await Notification.insertMany(
            ticketsToUpdate
              .filter((ticket) => ticket.status !== status)
              .map((ticket) => ({
                customerId: (ticket.customerId as any)._id,
                ticketId: ticket._id,
                type: 'STATUS_CHANGE',
                message: `Your ticket "${ticket.title}" moved from ${ticket.status} to ${status}.`,
              })),
            { session },
          );
          ticketsToUpdate
            .filter((ticket) => ticket.status !== status)
            .forEach((ticket) => {
              notificationEvents.push({
                ticketId: ticket._id.toString(),
                ticketTitle: ticket.title,
                recipient: (ticket.customerId as any).email || 'customer@example.com',
                oldStatus: ticket.status,
                newStatus: status,
              });
            });
        }
      });

      notificationEvents.forEach(simulateStatusChangeNotification);

      res.json({ success: true, updatedCount: objectIds.length });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // PUT /api/tickets/:id
  app.put('/api/tickets/:id', async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }

      const data = ticketSchema.parse(req.body);

      if (!mongoose.Types.ObjectId.isValid(data.customerId)) {
        return res.status(400).json({ success: false, message: 'Invalid customer ID', data: null });
      }

      const customer = await Customer.findById(data.customerId);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found', data: null });
      }

      const updateFilter: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
      if ((req as any).user?.role === 'staff') updateFilter.assignedTo = (req as any).user._id;
      const oldTicket = await Ticket.findOne(updateFilter);
      if (!oldTicket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
      if ((req as any).user?.role === 'admin' && oldTicket.status !== data.status) {
        return res
          .status(403)
          .json({ success: false, message: 'Administrators manage assignments, not ticket status.', data: null });
      }
      try {
        assertValidStatusTransition(oldTicket.status, data.status);
      } catch (err) {
        return handleApiError(res, req, err);
      }

      const author = (req as any).user?.username || 'System';
      const ticket = await withTransaction(async (session) => {
        const updatedTicket = await Ticket.findOneAndUpdate(
          updateFilter,
          {
            customerId: data.customerId,
            title: data.title,
            description: data.description,
            priority: data.priority,
            status: data.status,
            category: data.category,
            assignmentType: data.assignmentType,
            contract: data.contract,
            ticketForm: data.ticketForm,
            impact: data.impact,
            productFamily: data.productFamily,
            attachments: data.attachments,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
          },
          { returnDocument: 'after', session },
        ).populate('customerId', 'name email');
        if (!updatedTicket) return null;
        const logs = [];
        if (oldTicket.status !== data.status)
          logs.push({
            ticketId: updatedTicket._id,
            action: 'STATUS_CHANGE',
            details: `Status changed from ${oldTicket.status} to ${data.status}`,
            author,
          });
        if (oldTicket.priority !== data.priority)
          logs.push({
            ticketId: updatedTicket._id,
            action: 'PRIORITY_CHANGE',
            details: `Priority changed from ${oldTicket.priority} to ${data.priority}`,
            author,
          });
        if (logs.length > 0) await AuditLog.insertMany(logs, { session });
        if (data.notifyUser && oldTicket.status !== data.status) {
          await queueCustomerStatusNotification(
            {
              ticketId: updatedTicket._id.toString(),
              ticketTitle: updatedTicket.title,
              recipient: (updatedTicket.customerId as any)?.email || 'customer@example.com',
              customerId: oldTicket.customerId,
              oldStatus: oldTicket.status,
              newStatus: data.status,
            },
            session,
          );
        }
        return updatedTicket;
      });

      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });

      if (data.notifyUser && oldTicket.status !== data.status) {
        simulateStatusChangeNotification({
          ticketId: ticket.id.toString(),
          ticketTitle: ticket.title,
          recipient: (ticket.customerId as any)?.email || 'customer@example.com',
          oldStatus: oldTicket.status,
          newStatus: data.status,
        });
      }

      const json = ticket.toJSON();
      res.json({
        ...json,
        customerId: (ticket.customerId as any)?.id,
        customerName: (ticket.customerId as any)?.name,
        customerEmail: (ticket.customerId as any)?.email,
      });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // DELETE /api/tickets/:id
  app.delete('/api/tickets/:id', async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }

      const author = (req as any).user?.username || 'System';
      const ticket = await withTransaction(async (session) => {
        const activeTicket = await Ticket.findOne({ _id: req.params.id, deletedAt: null }).session(session);
        if (!activeTicket) return null;
        const archivedTicket = activeTicket.toObject();
        archivedTicket.deletedAt = new Date();
        (archivedTicket as any).deletedBy = author;
        await DeletedTicket.create([archivedTicket], { session });
        await Ticket.deleteOne({ _id: activeTicket._id }, { session });
        await AuditLog.create(
          [
            {
              ticketId: activeTicket._id,
              action: 'DELETED',
              details: 'Ticket deleted',
              author,
            },
          ],
          { session },
        );
        return activeTicket;
      });
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });

      res.status(204).send();
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // GET /api/customers
  app.get('/api/customers', async (req, res) => {
    try {
      const customers = await Customer.find().sort({ name: 1 });
      res.json(customers);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // GET /api/customers/:id/tickets
  app.get('/api/customers/:id/tickets', async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid customer ID', data: null });
      }

      const customer = await Customer.findById(req.params.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found', data: null });

      const tickets = await Ticket.find({ customerId: req.params.id })
        .populate('customerId', 'name email')
        .sort({ updatedAt: -1 });

      const formattedTickets = tickets.map((t) => {
        const json = t.toJSON();
        return {
          ...json,
          customerId: (t.customerId as any)?.id,
          customerName: (t.customerId as any)?.name,
          customerEmail: (t.customerId as any)?.email,
        };
      });

      res.json({ customer, tickets: formattedTickets });
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // GET /api/tickets/:id/comments
  app.get('/api/tickets/:id/comments', async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }
      const comments = await Comment.find({ ticketId: req.params.id }).sort({ createdAt: 1 });
      res.json(comments);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  // POST /api/tickets/:id/comments
  app.post('/api/tickets/:id/comments', async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID', data: null });
      }
      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
      if (ticket.status === 'Closed') {
        return res
          .status(409)
          .json({ success: false, message: 'Closed tickets cannot receive new comments.', data: null });
      }

      const data = commentSchema.parse(req.body);

      const newComment = await withTransaction(async (session) => {
        const [comment] = await Comment.create(
          [
            {
              ticketId: req.params.id,
              content: data.content,
              author: data.author,
            },
          ],
          { session },
        );
        await AuditLog.create(
          [
            {
              ticketId: req.params.id,
              action: 'COMMENT_ADDED',
              details: 'Added a new comment',
              author: data.author,
            },
          ],
          { session },
        );
        return comment;
      });

      res.status(201).json(newComment);
    } catch (err) {
      handleApiError(res, req, err);
    }
  });

  return app;
}

async function startServer() {
  await connectMongoDB();
  const app = await buildApp();

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VITEST !== 'true') {
  startServer().catch(async () => {
    console.error('Server startup failed. Check MongoDB configuration, replica-set support, and network access.');
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}
