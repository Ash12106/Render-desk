import 'dotenv/config';
import { faker } from '@faker-js/faker';
import mongoose from 'mongoose';
import { connectMongoDB, AuditLog, Comment, Customer, Ticket } from './mongo.js';

async function seed() {
  await connectMongoDB();
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB connection is required to seed the database.');
  }

  let customers = await Customer.find().limit(12);
  if (customers.length < 12) {
    const newCustomers = await Customer.insertMany(
      Array.from({ length: 12 - customers.length }, () => ({
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        customerCode: `CUST-${faker.string.numeric(6)}`,
      })),
    );
    customers = [...customers, ...newCustomers];
  }

  const existingTickets = await Ticket.countDocuments();
  if (existingTickets >= 50) {
    console.log(`Seed skipped: database already contains ${existingTickets} tickets.`);
    return;
  }

  const tickets = await Ticket.insertMany(
    Array.from({ length: 50 - existingTickets }, () => ({
      customerId: faker.helpers.arrayElement(customers)._id,
      title: faker.helpers.arrayElement([
        'Unable to sign in',
        'Billing page shows an incorrect amount',
        'Export job is stuck',
        'Notifications arrive late',
        'Integration setup needs assistance',
      ]),
      description: faker.lorem.sentences({ min: 2, max: 4 }),
      priority: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
      status: faker.helpers.arrayElement(['Open', 'In Progress', 'Resolved', 'Closed']),
      dueDate: faker.date.soon({ days: 14 }),
    })),
  );

  await AuditLog.insertMany(
    tickets.map((ticket) => ({
      ticketId: ticket._id,
      action: 'CREATED',
      details: 'Ticket created by seed script',
      author: 'seed',
    })),
  );

  await Comment.insertMany(
    tickets.slice(0, 10).map((ticket) => ({
      ticketId: ticket._id,
      content: faker.lorem.sentence(),
      author: 'seed',
    })),
  );

  console.log(`Seeded ${tickets.length} tickets and ${customers.length} customers.`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
