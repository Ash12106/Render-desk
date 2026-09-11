import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Configure ADMIN_PASSWORD before starting the server.');
  return password;
}

export async function connectMongoDB() {
  mongoose.set('bufferCommands', false);
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Configure MONGO_URI or MONGODB_URI before starting the server.');
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  } catch {
    throw new Error('Unable to connect to MongoDB. Check database configuration and network access.');
  }
  const topology = await mongoose.connection.db!.command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error(
      'MongoDB must use a replica set or sharded cluster because ticket operations require transactions.',
    );
  }
  console.log('Successfully connected to MongoDB.');
  await runMigrations();
}

export function getMongoConnectionState() {
  return {
    connected: mongoose.connection.readyState === 1,
    state: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    database: mongoose.connection.name || null,
  };
}

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    customerCode: { type: String, unique: true, sparse: true, index: true },
  },
  { timestamps: true },
);

customerSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const Customer = mongoose.model('Customer', customerSchema);

const ticketAttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: String, required: true },
  },
  { _id: false },
);

const ticketSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    title: { type: String, required: true, index: true },
    description: { type: String, required: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], required: true, index: true },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], required: true, index: true },
    activityStatus: {
      type: String,
      enum: ['Unread', 'Read', 'Awaiting customer response', 'Awaiting technician response'],
      default: 'Unread',
      index: true,
    },
    category: {
      type: String,
      enum: ['Technical', 'Sales', 'Billing', 'Account', 'Other'],
      default: 'Technical',
      index: true,
    },
    assignmentType: { type: String, enum: ['Incident', 'Problem', 'Request', 'Change'], default: 'Incident' },
    contract: { type: String, default: '' },
    ticketForm: { type: String, default: '' },
    impact: {
      type: String,
      enum: ['No Impact', 'Site Down', 'Server Issue', 'Minor', 'Major', 'Crisis'],
      default: 'No Impact',
    },
    productFamily: { type: String, default: '' },
    attachments: { type: [ticketAttachmentSchema], default: [] },
    dueDate: { type: Date },
    deletedAt: { type: Date, default: null },
    assignedGroup: { type: String, default: '', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true },
);

ticketSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const Ticket = mongoose.model('Ticket', ticketSchema);

const deletedTicketSchema = ticketSchema.clone();
deletedTicketSchema.add({
  deletedBy: { type: String, required: true },
});

export const DeletedTicket = mongoose.model('DeletedTicket', deletedTicketSchema);

const commentSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    content: { type: String, required: true },
    author: { type: String, required: true },
  },
  { timestamps: true },
);

commentSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const Comment = mongoose.model('Comment', commentSchema);

const auditLogSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    action: { type: String, required: true },
    details: { type: String, required: true },
    author: { type: String, required: true },
  },
  { timestamps: true },
);

auditLogSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff', 'customer'], default: 'staff', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    googleId: { type: String, unique: true, sparse: true, index: true },
    displayName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    team: { type: String, default: '' },
    branch: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret.passwordHash;
    delete ret._id;
    delete ret.__v;
  },
});

export const User = mongoose.model('User', userSchema);

const notificationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    type: { type: String, enum: ['STATUS_CHANGE'], required: true },
    message: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const Notification = mongoose.model('Notification', notificationSchema);

const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
});
export const Migration = mongoose.model('Migration', migrationSchema);

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

async function runMigrations() {
  console.log('[Migrations] Checking migrations...');
  const adminPassword = getAdminPassword();

  const migrations = [
    {
      name: '001_initial_admin_user',
      up: async () => {
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
          const passwordHash = await bcrypt.hash(adminPassword, 12);
          await User.create({
            username: 'admin',
            passwordHash,
            role: 'admin',
            displayName: 'Support Administrator',
            team: 'Operations',
            branch: 'Head Office',
          });
          console.log('[Migrations] Created default admin user.');
        }
      },
    },
    {
      name: '002_backfill_staff_roles_and_ticket_categories',
      up: async () => {
        await User.updateMany({ role: { $exists: false } }, { $set: { role: 'staff' } });
        await User.updateOne(
          { username: 'admin' },
          { $set: { role: 'admin', displayName: 'Support Administrator', team: 'Operations', branch: 'Head Office' } },
        );
        await Ticket.updateMany({ category: { $exists: false } }, { $set: { category: 'Technical' } });
      },
    },
    {
      name: '003_promote_admin_account',
      up: async () => {
        await User.updateOne(
          { username: 'admin' },
          { $set: { role: 'admin', displayName: 'Support Administrator', team: 'Operations', branch: 'Head Office' } },
        );
      },
    },
    {
      name: '004_backfill_customer_codes',
      up: async () => {
        const customers = await Customer.find({ customerCode: { $exists: false } });
        for (const customer of customers) {
          customer.customerCode = `CUST-${customer._id.toString().slice(-6).toUpperCase()}`;
          await customer.save();
        }
      },
    },
    {
      name: '005_archive_legacy_deleted_tickets',
      up: async () => {
        const legacyDeletedTickets = await Ticket.find({ deletedAt: { $ne: null } });
        for (const ticket of legacyDeletedTickets) {
          const archivedTicket = await DeletedTicket.findById(ticket._id);
          if (!archivedTicket) {
            const ticketData = ticket.toObject();
            (ticketData as any).deletedBy = 'legacy-soft-delete';
            await DeletedTicket.create(ticketData);
          }
          await Ticket.deleteOne({ _id: ticket._id });
        }
      },
    },
    {
      name: '006_reset_admin_password',
      up: async () => {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await User.updateOne({ username: 'admin' }, { $set: { passwordHash, role: 'admin' } });
      },
    },
  ];

  for (const migration of migrations) {
    const applied = await Migration.findOne({ name: migration.name });
    if (!applied) {
      console.log(`[Migrations] Applying ${migration.name}...`);
      await migration.up();
      await Migration.create({ name: migration.name });
      console.log(`[Migrations] Applied ${migration.name}`);
    }
  }

  console.log('[Migrations] Up to date.');
}
