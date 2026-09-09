# Support Ops Desk

Support Ops Desk is a full-stack service ticket management system built with React, TypeScript, Express, Mongoose, and MongoDB. It supports separate customer and staff experiences, administrator task management, assignment groups, staff availability, ticket activity tracking, audit logs, attachments, and operational reporting.

## Highlights

- **Customer view**: customers can register, sign in, create tickets, follow ticket status, receive notification records, add comments, and manage their profile.
- **Staff workspace**: staff see their assigned work, update lifecycle and activity status, add comments, download attachments, and publish their availability.
- **Administrator workspace**: admins manage staff profiles, roles, branches, teams, availability-aware assignments, bulk assignment, and operational reporting.
- **Ticket workflow**: lifecycle states (`Open`, `In Progress`, `Resolved`, `Closed`) are separate from activity states (`Unread`, `Read`, `Awaiting customer response`, `Awaiting technician response`).
- **Operational fields**: priority includes `Critical`; tickets support type, contract, ticket form, impact, product family, due date, assignment group, and attachments.
- **Audit logs**: ticket creation, lifecycle changes, priority changes, activity-status changes, comments, and deletion are recorded.
- **URL-driven dashboard state**: search, filters, pagination, sorting, and table/Kanban view are synchronized with URL query parameters for shareable and restorable views.
- **Optimistic UI**: comments, lifecycle changes, activity status, and staff availability update immediately and roll back on failure.
- **Database health**: `/api/health/db` performs a MongoDB ping and reports connection state.
- **API documentation**: Swagger UI is available at `/api-docs` while the server is running.

## Architecture

- `src/`: Vite React frontend with React Router, TanStack Query, Tailwind CSS, Recharts, and Motion.
- `server/`: Express API, Mongoose schemas, authentication middleware, validation, migrations, notifications, and tests.
- `server/index.ts`: development server entry point and production API/static-file server.
- `server/mongo.ts`: MongoDB connection, schemas, and migrations.
- `dist/`: generated production frontend and bundled server output. Do not edit it manually.

## Prerequisites

- Node.js 20 or newer recommended.
- npm.
- MongoDB 7 or newer, either local or hosted such as MongoDB Atlas.
- Docker is optional for running MongoDB or building a custom deployment image. This repository does not currently include a `Dockerfile` or `docker-compose.yml`; use the local/hosted MongoDB setup below unless you add those deployment files.

## Environment variables

Copy `.env.example` to `.env` and set the values for your environment:

```env
MONGO_URI=mongodb://localhost:27017/support-ops
PORT=3000
CORS_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
```

`MONGO_URI` is the preferred MongoDB variable. `MONGODB_URI` remains supported for backwards compatibility with existing environments and tests. Do not commit `.env` or any file containing credentials.

Google sign-in is optional. Set both Google client variables to the same web OAuth client ID and add the local application origin to the Google OAuth configuration. The backend verifies the Google ID token before linking or creating an account.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start MongoDB locally, or provision a hosted MongoDB database.

3. Create and configure the environment file:

   ```bash
   cp .env.example .env
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

   The application is served at `http://localhost:3000` by default. Set another port when 3000 is occupied:

   ```bash
   PORT=3001 npm run dev
   ```

5. Open the staff login at `http://localhost:3000/login` or the customer login at `http://localhost:3000/customer/login`.

## Seed data and migrations

The server runs database migrations during startup. To add sample customers, tickets, comments, and audit logs:

```bash
npm run seed
```

The seed script creates up to 12 customers and 50 tickets. It skips ticket generation when at least 50 tickets already exist. It does not delete existing data.

The default migration-created administrator is `admin`. The development password is printed by the migration output; change development credentials before using a shared or production database.

## Production build and run

Build the frontend and bundled server:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

The production server serves the compiled frontend and API from the same process. Set `NODE_ENV=production`, `MONGO_URI`, `PORT`, and a restricted `CORS_ORIGIN` in the deployment environment.

## Validation commands

```bash
npm run lint              # TypeScript check
npm run lint:eslint       # ESLint
npm test                  # Vitest frontend and API tests
npm run format:check      # Prettier check
npm run build             # Production compilation
npm audit                 # Dependency advisory scan
```

## API overview

All protected routes use `Authorization: Bearer <user-id>` in the current development authentication model. Customer-auth registration and login routes are public.

### Health and documentation

- `GET /api/health/db`: MongoDB readiness and ping status.
- `GET /api-docs`: Swagger UI.

### Authentication

- `POST /api/auth/login`: staff/admin login.
- `POST /api/customer-auth/register`: create a customer account.
- `POST /api/auth/google`: Google customer or pre-provisioned staff sign-in.

### Profiles and staff management

- `GET /api/profile`: current account profile.
- `PATCH /api/profile`: update display name and contact information.
- `PATCH /api/profile/availability`: staff-only availability toggle.
- `GET /api/admin/users`: admin-only staff directory and workload metrics.
- `POST /api/admin/users`: admin-only staff/admin account creation.
- `PATCH /api/admin/users/:id/role`: admin-only role management.
- `PATCH /api/admin/users/:id/details`: admin-only profile, team, and branch editing.

### Tickets

- `GET /api/tickets`: staff/admin ticket list with search, filters, pagination, and sorting.
- `GET /api/tickets/stats`: dashboard status, priority, and resolution metrics.
- `POST /api/tickets`: create a staff/admin ticket.
- `GET /api/tickets/:id`: ticket, comments, audit log, assignment, and attachments.
- `PUT /api/tickets/:id`: update ticket fields; staff updates are limited to assigned tickets and admins cannot change lifecycle status.
- `DELETE /api/tickets/:id`: soft-delete a ticket and write an audit entry.
- `PUT /api/tickets/bulk-status`: bulk lifecycle updates for staff.
- `PATCH /api/tickets/:id/activity-status`: update activity status for admins or assigned staff.
- `PATCH /api/admin/tickets/:id/assignment`: assign one ticket to an available staff member and group.
- `PATCH /api/admin/tickets/assignment`: bulk-assign selected tickets to one available staff member.
- `GET /api/tickets/:id/comments`: list comments.
- `POST /api/tickets/:id/comments`: add a comment.

### Customer routes

- `GET /api/customer/profile`: current customer profile.
- `PATCH /api/customer/profile`: update customer profile.
- `GET /api/customer/tickets`: current customer's tickets.
- `POST /api/customer/tickets`: create a customer ticket.
- `GET /api/customer/notifications`: list customer notifications.
- `PATCH /api/customer/notifications/:id/read`: mark a notification read.
- `DELETE /api/customer/notifications/:id`: delete one notification.
- `DELETE /api/customer/notifications`: clear notifications.
- `GET /api/customers`: staff/admin customer list.
- `GET /api/customers/:id/tickets`: customer profile and ticket history.

## Production audit notes

- Helmet, rate limiting, Zod validation, authentication middleware, soft deletion, and transactional writes are enabled.
- CORS is configurable with `CORS_ORIGIN`; set it explicitly in production.
- `npm audit --omit=dev` currently reports two moderate `qs` advisories inherited through Express 4. Run `npm audit fix` in a branch, review the lockfile and regression tests, then deploy the resulting upgrade after verification.
- `npm outdated` reports major-version candidates for Express, Vite, TypeScript, esbuild, and related packages. Upgrade those independently, not all at once, because they may require code and configuration changes.
- Operational startup, migration, seed, notification, and error logs remain intentionally present. Replace them with a structured logger and redact request/database details before production deployment rather than deleting observability outright.
