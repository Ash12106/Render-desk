import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from './index.js';
import mongoose from 'mongoose';
import { User, Customer, Ticket, Comment } from './mongo.js';
import bcrypt from 'bcryptjs';

describe('Support Desk API', () => {
  let app: any;
  let token: string;
  let testCustomer: any;
  let testTicket: any;
  let customerToken: string;
  let customerUser: any;
  let registeredCustomerUser: any;
  let adminToken: string;

  beforeAll(async () => {
    // Setup mongoose to memory if needed, but we can just use the provided URI or skip if not connected
    if (!process.env.MONGODB_URI) {
      console.warn('Skipping API tests: MONGODB_URI not set');
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);

    app = await buildApp();

    // Create a test user
    const passwordHash = await bcrypt.hash('testpass', 10);
    const user = await User.create({ username: 'testuser', passwordHash });
    token = user._id.toString();

    // Create a test customer
    testCustomer = await Customer.create({ name: 'Test Customer', email: 'test@example.com' });
    const customerPasswordHash = await bcrypt.hash('customerpass', 10);
    customerUser = await User.create({
      username: `testcustomer${Date.now()}`,
      passwordHash: customerPasswordHash,
      role: 'customer',
      customerId: testCustomer._id,
    });
    customerToken = customerUser._id.toString();
    const admin = await User.findOne({ username: 'admin' });
    adminToken = admin?._id.toString();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({ username: 'testuser' });
      await User.findByIdAndDelete(customerUser?._id);
      if (registeredCustomerUser) {
        await Customer.findByIdAndDelete(registeredCustomerUser.customerId);
        await User.findByIdAndDelete(registeredCustomerUser.id);
      }
      await Customer.findByIdAndDelete(testCustomer?._id);
      if (testTicket) {
        await Ticket.findByIdAndDelete(testTicket._id);
        await Comment.deleteMany({ ticketId: testTicket._id });
      }
      await mongoose.disconnect();
    }
  });

  it('should authenticate user and return token', async () => {
    if (!app) return;
    const res = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'testpass' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testuser');
    expect(res.body.id).toBe(token);
  });

  it('returns account profile timestamps and protects admin role management', async () => {
    if (!app) return;
    const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.createdAt).toBeDefined();
    expect(profile.body.updatedAt).toBeDefined();

    const customerRoleChange = await request(app)
      .patch(`/api/admin/users/${customerUser.id}/role`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ role: 'staff' });
    expect(customerRoleChange.status).toBe(403);

    const customerUpdate = await request(app)
      .patch('/api/customer/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Updated Customer', email: 'updated@example.com', phone: '555-0100' });
    expect(customerUpdate.status).toBe(200);
    expect(customerUpdate.body.phone).toBe('555-0100');
  });

  it('lets admins create staff with teams and inspect workload metrics', async () => {
    if (!app || !adminToken) return;
    const username = `managedstaff${Date.now()}`;
    const created = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username,
        password: 'staffpass123',
        displayName: 'Managed Staff',
        email: `${username}@example.com`,
        team: 'Technical Support',
        branch: 'Bengaluru',
        role: 'staff',
      });
    expect(created.status).toBe(201);
    const directory = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(directory.status).toBe(200);
    expect(
      directory.body.some(
        (user: any) => user.username === username && user.working !== undefined && user.solved !== undefined,
      ),
    ).toBe(true);
    await User.deleteOne({ username });
  });

  it('should protect routes with auth middleware', async () => {
    if (!app) return;
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
  });

  it('should validate Google login credentials before attempting verification', async () => {
    if (!app) return;
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('should register a separate customer account', async () => {
    if (!app) return;
    const username = `newcustomer${Date.now()}`;
    const res = await request(app)
      .post('/api/customer-auth/register')
      .send({
        name: 'New Customer',
        email: `${username}@example.com`,
        username,
        password: 'customerpass',
      });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('customer');
    expect(res.body.customerId).toBeDefined();
    registeredCustomerUser = res.body;
  });

  it('should create a new ticket', async () => {
    if (!app) return;
    const res = await request(app).post('/api/tickets').set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'API Test Ticket',
      description: 'Testing ticket creation via supertest',
      priority: 'High',
      status: 'Open',
      category: 'Technical',
    });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('API Test Ticket');
    expect(res.body.category).toBe('Technical');
    testTicket = res.body;
  });

  it('should fetch tickets with pagination', async () => {
    if (!app) return;
    const res = await request(app).get('/api/tickets?limit=10&offset=0').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toBeInstanceOf(Array);
    expect(res.body.total).toBeDefined();
    expect(res.body.tickets.length).toBeGreaterThan(0);
  });

  it('should get a single ticket with comments', async () => {
    if (!app) return;
    const res = await request(app).get(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket.id).toBe(testTicket.id);
    expect(res.body.comments).toBeInstanceOf(Array);
  });

  it('should update a ticket', async () => {
    if (!app) return;
    const res = await request(app).put(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Updated Title',
      description: 'Updated Description',
      priority: 'Medium',
      status: 'In Progress',
      category: 'Sales',
      notifyUser: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.category).toBe('Sales');
  });

  it('scopes customer access and stores status notifications', async () => {
    if (!app) return;
    const customerProfile = await request(app)
      .get('/api/customer/profile')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerProfile.status).toBe(200);
    expect(customerProfile.body.email).toBe('updated@example.com');

    const customerTickets = await request(app)
      .get('/api/customer/tickets')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerTickets.status).toBe(200);
    expect(customerTickets.body.some((ticket: any) => ticket.id === testTicket.id)).toBe(true);

    const notifications = await request(app)
      .get('/api/customer/notifications')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(notifications.status).toBe(200);
    expect(notifications.body.some((notification: any) => notification.ticketId === testTicket.id)).toBe(true);

    const staffOnly = await request(app).get('/api/tickets').set('Authorization', `Bearer ${customerToken}`);
    expect(staffOnly.status).toBe(403);
  });

  it('notifies the customer when staff uses bulk status updates', async () => {
    if (!app) return;
    const update = await request(app)
      .put('/api/tickets/bulk-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketIds: [testTicket.id], status: 'Resolved' });
    expect(update.status).toBe(200);

    const notifications = await request(app)
      .get('/api/customer/notifications')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(notifications.body.some((notification: any) => notification.message.includes('Resolved'))).toBe(true);
  });

  it('lets customers clear individual and all notifications', async () => {
    if (!app) return;
    const current = await request(app)
      .get('/api/customer/notifications')
      .set('Authorization', `Bearer ${customerToken}`);
    const notificationId = current.body[0].id;
    const deleted = await request(app)
      .delete(`/api/customer/notifications/${notificationId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(deleted.status).toBe(204);

    const update = await request(app)
      .put(`/api/tickets/${testTicket.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomer._id.toString(),
        title: 'Updated Title',
        description: 'Updated Description',
        priority: 'Medium',
        status: 'Closed',
        category: 'Sales',
        notifyUser: true,
      });
    expect(update.status).toBe(200);

    const cleared = await request(app)
      .delete('/api/customer/notifications')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.deletedCount).toBeGreaterThan(0);
  });

  it('rejects reopening a closed ticket', async () => {
    if (!app) return;
    const res = await request(app).put(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Updated Title',
      description: 'Updated Description',
      priority: 'Medium',
      status: 'Open',
      category: 'Sales',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invalid status transition from Closed to Open');
  });

  it('should add a comment to a ticket', async () => {
    if (!app) return;
    const res = await request(app)
      .post(`/api/tickets/${testTicket.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'This is a test comment',
        author: 'Tester',
      });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('This is a test comment');
  });

  it('should delete a ticket', async () => {
    if (!app) return;
    const res = await request(app).delete(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);

    expect(check.status).toBe(404);
  });
});
