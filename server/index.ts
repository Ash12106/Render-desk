import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { connectMongoDB, Ticket, Customer, Comment, User, AuditLog, Notification } from './mongo.js';
import { z } from 'zod';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { OAuth2Client } from 'google-auth-library';
import { queueCustomerStatusNotification, simulateStatusChangeNotification } from './notifications.js';
import { assertValidStatusTransition } from './status.js';

const PORT = 3000;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(googleClientId);

const ticketSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer.'),
  title: z.string().trim().min(1, 'Enter a ticket title.'),
  description: z.string().trim().min(1, 'Describe the reported issue.'),
  priority: z.enum(['Low', 'Medium', 'High'], {
    message: 'Choose a valid priority.',
  }),
  status: z.enum(['Open', 'In Progress', 'Resolved', 'Closed'], {
    message: 'Choose a valid status.',
  }),
  dueDate: z.string().optional().nullable(),
  category: z.enum(['Technical', 'Sales', 'Billing', 'Account', 'Other']).default('Technical'),
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

  app.use(cors());
  app.use(express.json());
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use('/api/tickets', mutationLimiter);

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
              customerCode: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
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
        if (existingGoogleUser) return existingGoogleUser;

        if (accountType === 'staff') {
          const staffAccount = await User.findOne({ email, role: { $in: ['staff', 'admin'] } }).session(session);
          if (!staffAccount)
            throw new Error('Ask an administrator to create your staff account before using Google sign-in.');
          staffAccount.googleId = payload.sub;
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
      (err.message && err.message.includes('buffering timed out'))
    ) {
      console.warn('Database offline — returning mock empty response');
      if (req.method === 'GET') {
        return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
      }
      return res
        .status(503)
        .json({ success: false, message: 'Service temporarily unavailable (database offline)', data: null });
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
    if (err instanceof Error && 'statusCode' in err && err.statusCode === 409) {
      return res.status(409).json({ success: false, message: err.message, data: null });
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
      const { username, password } = req.body;
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

  // Apply Auth Middleware to all subsequent API routes
  app.use('/api', authMiddleware);

  app.get('/api/profile', async (req, res) => {
    try {
      const user = await User.findById((req as any).user._id).populate('customerId');
      if (!user) return res.status(404).json({ success: false, message: 'Profile not found.', data: null });
      res.json(user);
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
          phone: z.string().trim().max(30).optional(),
          team: z.string().trim().min(1).optional(),
          branch: z.string().trim().min(1).optional(),
        })
        .parse(req.body);
      const user = await User.findByIdAndUpdate((req as any).user._id, data, { returnDocument: 'after' });
      if (!user) return res.status(404).json({ success: false, message: 'Profile not found.', data: null });
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

  app.post('/api/admin/users', mutationLimiter, requireAdmin, async (req, res) => {
    try {
      const data = z
        .object({
          username: z.string().trim().min(3),
          password: z.string().min(8),
          displayName: z.string().trim().min(2),
          email: z.string().email(),
          phone: z.string().trim().optional(),
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
          phone: z.string().trim().max(30).optional(),
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
      const { assignedTo } = z.object({ assignedTo: z.string().nullable() }).parse(req.body);
      if (assignedTo && !mongoose.Types.ObjectId.isValid(assignedTo))
        return res.status(400).json({ success: false, message: 'Invalid staff account.', data: null });
      const ticket = await Ticket.findOneAndUpdate(
        { _id: req.params.id, deletedAt: null },
        { assignedTo },
        { returnDocument: 'after' },
      ).populate('assignedTo', 'displayName username team branch');
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.', data: null });
      res.json(ticket);
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
          phone: z.string().trim().max(30).optional(),
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
      const tickets = await Ticket.find({ deletedAt: null });
      const statusCounts: Record<string, number> = { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
      const priorityCounts: Record<string, number> = { Low: 0, Medium: 0, High: 0 };
      const resolutionTimes: Record<string, { totalMs: number; count: number }> = {
        Low: { totalMs: 0, count: 0 },
        Medium: { totalMs: 0, count: 0 },
        High: { totalMs: 0, count: 0 },
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

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (customerId) filter.customerId = customerId;

      const parsedLimit = Math.min(parseInt(limit as string) || 50, 100); // enforce max limit
      const parsedOffset = parseInt(offset as string) || 0;

      let sortObj: any = { updatedAt: -1 };
      if (sort === 'date') sortObj = { createdAt: -1 };
      else if (sort === 'priority') {
        sortObj = { priority: 1 };
      }

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

      const ticket = await Ticket.findOne({ _id: req.params.id, deletedAt: null }).populate('customerId', 'name email');
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
              dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
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

      const oldTicket = await Ticket.findOne({ _id: req.params.id, deletedAt: null });
      if (!oldTicket) return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
      try {
        assertValidStatusTransition(oldTicket.status, data.status);
      } catch (err) {
        return handleApiError(res, req, err);
      }

      const author = (req as any).user?.username || 'System';
      const ticket = await withTransaction(async (session) => {
        const updatedTicket = await Ticket.findOneAndUpdate(
          { _id: req.params.id, deletedAt: null },
          {
            customerId: data.customerId,
            title: data.title,
            description: data.description,
            priority: data.priority,
            status: data.status,
            category: data.category,
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
        const deletedTicket = await Ticket.findOneAndUpdate(
          { _id: req.params.id, deletedAt: null },
          { deletedAt: new Date() },
          { returnDocument: 'after', session },
        );
        if (!deletedTicket) return null;
        await AuditLog.create(
          [
            {
              ticketId: deletedTicket._id,
              action: 'DELETED',
              details: 'Ticket deleted',
              author,
            },
          ],
          { session },
        );
        return deletedTicket;
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
  startServer();
}
