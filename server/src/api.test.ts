import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from './index.js';
import mongoose from 'mongoose';
import { User, Customer, Ticket, Comment, DeletedTicket, AuditLog, Notification } from '../models/mongo.js';
import bcrypt from 'bcryptjs';

const testMongoUri = process.env.TEST_MONGODB_URI;

describe.skipIf(!testMongoUri)('Support Desk API (dedicated test database)', () => {
  const staffUsername = `teststaff${Date.now()}`;
  let app: any;
  let token: string;
  let testCustomer: any;
  let testTicket: any;
  let customerToken: string;
  let customerUser: any;
  let registeredCustomerUser: any;
  let adminToken: string;

  beforeAll(async () => {
    // Never run mutating integration tests against the application's database.
    const databaseName = new URL(testMongoUri!).pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('TEST_MONGODB_URI must point to a dedicated database ending in _test.');
    }
    await mongoose.connect(testMongoUri!, { serverSelectionTimeoutMS: 5000 });

    app = await buildApp();

    // Create a test user
    const passwordHash = await bcrypt.hash('testpass', 10);
    const user = await User.create({ username: staffUsername, passwordHash });
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
    const admin = await User.create({ username: `testadmin${Date.now()}`, passwordHash, role: 'admin' });
    adminToken = admin._id.toString();
  }, 30000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      if (token) await User.findByIdAndDelete(token);
      if (adminToken) await User.findByIdAndDelete(adminToken);
      if (customerUser) await User.findByIdAndDelete(customerUser._id);
      if (registeredCustomerUser) {
        await Customer.findByIdAndDelete(registeredCustomerUser.customerId);
        await User.findByIdAndDelete(registeredCustomerUser.id);
      }
      await Customer.findByIdAndDelete(testCustomer?._id);
      if (testCustomer) {
        const active = await Ticket.find({ customerId: testCustomer._id }).select('_id');
        const archived = await DeletedTicket.find({ customerId: testCustomer._id }).select('_id');
        const ticketIds = [...active, ...archived].map((ticket) => ticket._id);
        await Ticket.deleteMany({ customerId: testCustomer._id });
        await DeletedTicket.deleteMany({ customerId: testCustomer._id });
        await Comment.deleteMany({ ticketId: { $in: ticketIds } });
        await AuditLog.deleteMany({ ticketId: { $in: ticketIds } });
        await Notification.deleteMany({ customerId: testCustomer._id });
      }
      await mongoose.disconnect();
    }
  });

  it('should authenticate user and return token', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: staffUsername, password: 'testpass' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(staffUsername);
    expect(res.body.id).toBe(token);
  });

  it('reports database readiness', async () => {
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database.connected).toBe(true);
  });

  it('returns account profile timestamps and protects admin role management', async () => {
    const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.createdAt).toBeDefined();
    expect(profile.body.updatedAt).toBeDefined();

    const customerRoleChange = await request(app)
      .patch(`/api/admin/users/${customerUser.id}/role`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ role: 'staff' });
    expect(customerRoleChange.status).toBe(403);

    const staffSelfRoleChange = await request(app)
      .patch(`/api/admin/users/${token}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(staffSelfRoleChange.status).toBe(403);

    const staffBranchChange = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Test User', email: 'test@example.com', branch: 'Restricted Branch' });
    expect(staffBranchChange.status).toBe(400);

    const customerUpdate = await request(app)
      .patch('/api/customer/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Updated Customer', email: 'updated@example.com', phone: '5550100000' });
    expect(customerUpdate.status).toBe(200);
    expect(customerUpdate.body.phone).toBe('5550100000');
  });

  it('lets admins create staff with teams and inspect workload metrics', async () => {
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
    const branchUpdate = await request(app)
      .patch(`/api/admin/users/${created.body.id}/details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        displayName: 'Managed Staff',
        email: `${username}@example.com`,
        phone: '',
        team: 'Technical Support',
        branch: 'Mumbai',
      });
    expect(branchUpdate.status).toBe(200);
    expect(branchUpdate.body.branch).toBe('Mumbai');
    const directory = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(directory.status).toBe(200);
    expect(
      directory.body.some(
        (user: any) =>
          user.username === username &&
          user.joiningDate !== undefined &&
          user.working !== undefined &&
          user.solved !== undefined,
      ),
    ).toBe(true);
    await User.deleteOne({ username });
  });

  it('should protect routes with auth middleware', async () => {
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
  });

  it('accepts multiple ticket sort criteria', async () => {
    const res = await request(app)
      .get('/api/tickets?limit=10&offset=0&sort=priority,date')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tickets).toBeInstanceOf(Array);
  });

  it('should validate Google login credentials before attempting verification', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('should register a separate customer account', async () => {
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
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomer._id.toString(),
        title: 'API Test Ticket',
        description: 'Testing ticket creation via supertest',
        priority: 'High',
        status: 'Open',
        category: 'Technical',
        assignmentType: 'Incident',
        impact: 'Major',
        productFamily: 'Core Platform',
        attachments: [{ name: 'error.txt', type: 'text/plain', size: 12, data: 'data:text/plain;base64,ZXJyb3I=' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('API Test Ticket');
    expect(res.body.category).toBe('Technical');
    expect(res.body.impact).toBe('Major');
    expect(res.body.attachments).toHaveLength(1);
    testTicket = res.body;
    const persisted = await Ticket.findById(testTicket.id);
    expect(persisted?.title).toBe(res.body.title);
    expect(persisted?.customerId.toString()).toBe(testCustomer.id);
  });

  it('accepts Critical priority for new tickets', async () => {
    const res = await request(app).post('/api/tickets').set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Critical priority test ticket',
      description: 'Testing critical priority support',
      priority: 'Critical',
      status: 'Open',
      category: 'Technical',
    });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe('Critical');
    await request(app).delete(`/api/tickets/${res.body.id}`).set('Authorization', `Bearer ${token}`);
  });

  it('should fetch tickets with pagination', async () => {
    const res = await request(app).get('/api/tickets?limit=10&offset=0').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toBeInstanceOf(Array);
    expect(res.body.total).toBeDefined();
    expect(res.body.tickets.length).toBeGreaterThan(0);
  });

  it('should get a single ticket with comments', async () => {
    const res = await request(app).get(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket.id).toBe(testTicket.id);
    expect(res.body.comments).toBeInstanceOf(Array);
  });

  it('should update a ticket', async () => {
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

  it('lets admins assign a group and staff member but not change status', async () => {
    const assignment = await request(app)
      .patch(`/api/admin/tickets/${testTicket.id}/assignment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedTo: token, assignedGroup: 'Technical Support' });
    expect(assignment.status).toBe(200);
    expect(assignment.body.assignedGroup).toBe('Technical Support');

    const adminStatusChange = await request(app)
      .put(`/api/tickets/${testTicket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId: testCustomer._id.toString(),
        title: 'Updated Title',
        description: 'Updated Description',
        priority: 'Medium',
        status: 'Resolved',
        category: 'Sales',
      });
    expect(adminStatusChange.status).toBe(403);
  });

  it('lets admins bulk assign selected tickets to one staff member', async () => {
    const bulkAssignment = await request(app)
      .patch('/api/admin/tickets/assignment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ticketIds: [testTicket.id], assignedTo: token });
    expect(bulkAssignment.status).toBe(200);
    expect(bulkAssignment.body.assignedCount).toBe(1);
  });

  it('lets assigned staff update activity status', async () => {
    const activityUpdate = await request(app)
      .patch(`/api/tickets/${testTicket.id}/activity-status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activityStatus: 'Awaiting customer response' });
    expect(activityUpdate.status).toBe(200);
    expect(activityUpdate.body.activityStatus).toBe('Awaiting customer response');
  });

  it('lets staff toggle availability and blocks unavailable assignments', async () => {
    const unavailable = await request(app)
      .patch('/api/profile/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ isAvailable: false });
    expect(unavailable.status).toBe(200);
    expect(unavailable.body.isAvailable).toBe(false);

    const rejected = await request(app)
      .patch(`/api/admin/tickets/${testTicket.id}/assignment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedTo: token, assignedGroup: 'Technical Support' });
    expect(rejected.status).toBe(409);

    await request(app)
      .patch('/api/profile/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ isAvailable: true });
  });

  it('scopes customer access and stores status notifications', async () => {
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
        status: 'Resolved',
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
    const created = await request(app).post('/api/tickets').set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Closed conversation test ticket',
      description: 'Testing closed ticket restrictions',
      priority: 'Medium',
      status: 'Open',
      category: 'Sales',
    });
    const closedTicketId = created.body.id;
    await request(app).put(`/api/tickets/${closedTicketId}`).set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Closed conversation test ticket',
      description: 'Testing closed ticket restrictions',
      priority: 'Medium',
      status: 'In Progress',
      category: 'Sales',
    });
    await request(app).put(`/api/tickets/${closedTicketId}`).set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Closed conversation test ticket',
      description: 'Testing closed ticket restrictions',
      priority: 'Medium',
      status: 'Resolved',
      category: 'Sales',
    });
    await request(app).put(`/api/tickets/${closedTicketId}`).set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Closed conversation test ticket',
      description: 'Testing closed ticket restrictions',
      priority: 'Medium',
      status: 'Closed',
      category: 'Sales',
    });

    const res = await request(app).put(`/api/tickets/${closedTicketId}`).set('Authorization', `Bearer ${token}`).send({
      customerId: testCustomer._id.toString(),
      title: 'Closed conversation test ticket',
      description: 'Testing closed ticket restrictions',
      priority: 'Medium',
      status: 'Open',
      category: 'Sales',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invalid status transition from Closed to Open');

    const staffComment = await request(app)
      .post(`/api/tickets/${closedTicketId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'This should be rejected.', author: 'Tester' });
    expect(staffComment.status).toBe(409);

    const customerComment = await request(app)
      .post(`/api/customer/tickets/${closedTicketId}/comments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ content: 'This should also be rejected.' });
    expect(customerComment.status).toBe(409);

    await request(app).delete(`/api/tickets/${closedTicketId}`).set('Authorization', `Bearer ${token}`);
  }, 15_000);

  it('should add a comment to a ticket', async () => {
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

  it('lets the ticket customer read and add conversation comments', async () => {
    const customerComments = await request(app)
      .get(`/api/customer/tickets/${testTicket.id}/comments`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerComments.status).toBe(200);

    const reply = await request(app)
      .post(`/api/customer/tickets/${testTicket.id}/comments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ content: 'Here is an update from the customer.' });
    expect(reply.status).toBe(201);
    expect(reply.body.content).toBe('Here is an update from the customer.');
    expect(reply.body.author).toBe(customerUser.username);

    const staffComments = await request(app)
      .get(`/api/tickets/${testTicket.id}/comments`)
      .set('Authorization', `Bearer ${token}`);
    expect(staffComments.body.some((comment: any) => comment.id === reply.body.id)).toBe(true);
  });

  it('should delete a ticket', async () => {
    const res = await request(app).delete(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const archived = await DeletedTicket.findById(testTicket.id);
    expect(archived).not.toBeNull();
    expect((archived as any)?.deletedBy).toBe(staffUsername);

    const check = await request(app).get(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);

    expect(check.status).toBe(404);

    const restored = await request(app)
      .post(`/api/admin/deleted-tickets/${testTicket.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(restored.status).toBe(200);
    expect(restored.body.id).toBe(testTicket.id);

    const restoredCheck = await request(app)
      .get(`/api/tickets/${testTicket.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(restoredCheck.status).toBe(200);

    await request(app).delete(`/api/tickets/${testTicket.id}`).set('Authorization', `Bearer ${token}`);
  }, 15_000);
});
