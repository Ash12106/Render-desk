import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { buildApp } from './index';
import { User, Ticket, AuditLog } from '../models/mongo';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
afterEach(() => vi.restoreAllMocks());

// Handler unit tests: no sockets or live database. HTTP middleware is covered by api.test.ts.
async function invoke(method: string, path: string, options: Record<string, unknown> = {}) {
  const route = app._router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { method: method.toUpperCase(), path, body: {}, params: {}, query: {}, ...options };
  let status = 200;
  let body: any;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: unknown) {
      body = value;
      return res;
    },
  };
  await route.stack.at(-1).handle(req, res);
  return { status, body };
}

function account(role: 'admin' | 'staff' | 'customer') {
  return new User({ username: 'test-account', role, customerId: new mongoose.Types.ObjectId() });
}

describe('API handler contracts (mocked database)', () => {
  it.each(['admin', 'staff', 'customer'] as const)(
    'reports database read failure for %s rather than fake data',
    async (role) => {
      vi.spyOn(Ticket, 'find').mockImplementation(() => {
        throw new mongoose.Error('Database unavailable');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const path = role === 'customer' ? '/api/customer/tickets' : '/api/tickets/stats';
      const response = await invoke('get', path, { user: account(role) });
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ success: false, data: null });
    },
  );
  it('reports disconnected database health', async () => {
    const response = await invoke('get', '/api/health/db');
    expect(response.status).toBe(503);
    expect(response.body.database.connected).toBe(false);
  });
  it('validates login before querying MongoDB', async () => {
    const find = vi.spyOn(User, 'findOne');
    const response = await invoke('post', '/api/auth/login');
    expect(response.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });
  it('rejects negative pagination without querying tickets', async () => {
    const find = vi.spyOn(Ticket, 'find');
    const response = await invoke('get', '/api/tickets', { user: account('staff'), query: { offset: '-1' } });
    expect(response.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });
  it('keeps customer and assignee identifiers flat after an activity-status update', async () => {
    const user = account('staff');
    const customer = {
      id: new mongoose.Types.ObjectId().toString(),
      name: 'Database customer',
      email: 'customer@example.com',
    };
    const ticket = {
      _id: new mongoose.Types.ObjectId(),
      customerId: customer,
      assignedTo: user,
      toJSON: () => ({ customerId: customer, assignedTo: user, activityStatus: 'Read' }),
    };
    vi.spyOn(Ticket, 'findOneAndUpdate').mockReturnValue({ populate: () => ({ populate: async () => ticket }) } as any);
    vi.spyOn(AuditLog, 'create').mockResolvedValue([] as any);
    const response = await invoke('patch', '/api/tickets/:id/activity-status', {
      user,
      params: { id: ticket._id.toString() },
      body: { activityStatus: 'Read' },
    });
    expect(response.status).toBe(200);
    expect(response.body.customerId).toBe(customer.id);
    expect(response.body.assignedTo).toBe(user.id);
    expect(response.body.customerName).toBe(customer.name);
  });
  it('rejects invalid due dates before writing a ticket', async () => {
    const create = vi.spyOn(Ticket, 'create');
    const response = await invoke('post', '/api/tickets', {
      user: account('staff'),
      body: {
        customerId: new mongoose.Types.ObjectId().toString(),
        title: 'Issue',
        description: 'Details',
        priority: 'Medium',
        status: 'Open',
        dueDate: 'invalid-date',
      },
    });
    expect(response.status).toBe(400);
    expect(response.body.fields.dueDate).toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });
});
