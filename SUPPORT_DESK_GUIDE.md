# Support Ops Desk Guide

This guide explains how to run, configure, use, test, and hand off Support Ops Desk.

## 1. What the application does

Support Ops Desk is a ticket system with three account types:

- **Administrator**: manages staff and administrator accounts, teams, branches, availability, assignments, and operational data.
- **Staff**: works on assigned tickets, updates status and activity state, posts activity comments, and manages availability.
- **Customer**: creates tickets, follows ticket status, reads the activity log, replies to staff, and manages their profile.

Tickets and profiles are persisted in MongoDB. Browser storage only keeps the current development login session.

## 2. Requirements

- Node.js 20 or newer
- npm
- MongoDB 7 or newer, local or MongoDB Atlas
- A browser such as Chrome, Edge, Safari, or Firefox

## 3. First-time setup

```bash
git clone <repository-url>
cd Internship-main
npm install
cp .env.example .env
```

Edit `.env`:

```env
MONGO_URI=mongodb://localhost:27017/support-ops
PORT=3000
CORS_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
```

Use either `MONGO_URI` or the backwards-compatible `MONGODB_URI`. Never commit `.env`.

Start the application:

```bash
npm run dev
```

Open:

- Staff/admin: `http://localhost:3000/login`
- Customer: `http://localhost:3000/customer/login`
- Database health: `http://localhost:3000/api/health/db`
- API documentation: `http://localhost:3000/api-docs`

The server runs migrations at startup. The first connected database receives a default administrator account:

```text
Username: admin
Password: password123
```

Change this credential before using a shared or production database.

## 4. Using multiple devices

Only the computer running Node.js needs the repository and MongoDB access. Phones, tablets, laptops, and other browsers connect to that computer.

### Same Wi-Fi or LAN

Find the host computer's LAN address. On macOS, one option is:

```bash
ipconfig getifaddr en0
```

If it returns `192.168.1.25`, open:

```text
http://192.168.1.25:3000/login
http://192.168.1.25:3000/customer/login
```

The server binds to `0.0.0.0`, and the frontend calls the API using same-origin `/api` paths. Therefore all devices see the same MongoDB data. Each browser has an independent login session, so use different accounts in different browsers/devices:

1. Device A: administrator at `/login`.
2. Device B: staff member at `/login`.
3. Device C: customer at `/customer/login`.

Create staff accounts from the administrator's **Manage staff** screen. Customers can register from the customer login page.

If the other device cannot connect:

1. Confirm both devices are on the same network.
2. Confirm the host server is still running.
3. Confirm macOS Firewall allows Node.js incoming connections.
4. Confirm port `3000` is not blocked by the network.
5. Test `http://<host-ip>:3000/api/health/db` from the other device.

For a LAN demonstration without hot reload:

```bash
DISABLE_HMR=true npm run dev
```

### Internet or production deployment

Do not expose the development server directly to the public internet. Build and run the production server behind HTTPS and a reverse proxy or managed hosting service:

```bash
NODE_ENV=production npm run build
NODE_ENV=production npm start
```

Set `CORS_ORIGIN` to the exact public origin, for example `https://support.example.com`, and configure MongoDB network access for the deployed server only.

## 5. Google sign-in setup

Google sign-in is optional. In Google Cloud Console:

1. Create or select a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create a Web application OAuth client.
4. Add every local or deployed origin to **Authorized JavaScript origins**, for example:
   - `http://localhost:3000`
   - `http://192.168.1.25:3000`
   - `https://support.example.com`
5. Put the same client ID in both variables:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Restart the server after changing `.env`. The backend verifies the Google ID token. Customer Google sign-in creates or links a customer account. Staff Google sign-in only works for a staff/admin account that an administrator created first with the same email address.

## 6. Account workflows

### Administrator

1. Sign in at `/login`.
2. Open **Manage staff**.
3. Create a staff or administrator account with username, password, display name, email, team, and branch.
4. Edit staff details, change roles, and review workload metrics.
5. Use the ticket dashboard to assign tickets to available staff.
6. Use the staff directory to review profile and availability information.

### Staff

1. Sign in at `/login` using an administrator-created account.
2. View assigned tickets in the dashboard.
3. Search by title/customer and combine status, priority, customer, pagination, and sorting controls.
4. Create, inspect, edit, and comment on tickets.
5. Change the lifecycle through `Open -> In Progress -> Resolved -> Closed`.
6. Update activity status and availability from the profile/workspace.

### Customer

1. Open `/customer/login`.
2. Register with a name, email, username, and password, or use configured Google sign-in.
3. Raise a ticket from **Raise ticket**.
4. Open a ticket from **My requests**.
5. Read the shared **Activity Log** and send replies while the ticket is open.
6. Once staff closes the ticket, the activity log remains readable but no new messages can be sent.

## 7. Ticket and conversation behavior

- Customers and staff share the same MongoDB `comments` records.
- Staff comments appear in the customer activity log.
- Customer replies appear in the staff activity feed.
- The sender sees a successful comment immediately.
- The other side refreshes the activity feed automatically while the ticket is open.
- Closed tickets are read-only for both roles. The API rejects new comments with HTTP `409`.
- Deleting a ticket moves it to `deleted_tickets`; it is not shown in active ticket lists.

## 8. Data model and persistence

Important MongoDB collections:

- `users`: administrator, staff, and customer login accounts.
- `customers`: customer profiles.
- `tickets`: active tickets.
- `deleted_tickets`: archived deleted tickets with `deletedAt` and `deletedBy`.
- `comments`: ticket conversation messages.
- `auditlogs`: ticket creation, status changes, comments, deletion, and restoration.
- `notifications`: customer status-change notifications.
- `migrations`: applied startup migrations.

Customers are normalized: one customer profile can own many tickets through `customerId`. Deleting a ticket does not delete its comments or audit records.

## 9. Deleted ticket rollback

Administrators can inspect or restore archived tickets through the API:

```bash
curl -H "Authorization: Bearer <admin-user-id>" \
  http://localhost:3000/api/admin/deleted-tickets

curl -X POST -H "Authorization: Bearer <admin-user-id>" \
  http://localhost:3000/api/admin/deleted-tickets/<ticket-id>/restore
```

Restoration keeps the original ticket ID, so comments and audit logs reconnect automatically. Startup migration `005_archive_legacy_deleted_tickets` moves records left behind by the old in-place soft-delete behavior into `deleted_tickets`.

## 10. Testing and release checks

Run the complete checks before pushing or deploying:

```bash
npm run lint
npm test
npm run lint:eslint
npm run format:check
npm run build
```

Manual smoke test:

1. Open `/login` and sign in as admin.
2. Create a staff account.
3. Open customer registration in another browser/device.
4. Create a customer ticket.
5. Confirm the staff dashboard receives it.
6. Post a staff comment and confirm the customer activity log receives it.
7. Post a customer reply and confirm the staff activity feed receives it.
8. Close the ticket and confirm both reply forms are disabled.
9. Delete the ticket and restore it as admin.
10. Confirm the original ticket and conversation history are available after restore.

## 11. Troubleshooting

### White screen or stale behavior

Stop old Node processes, start one server, and hard refresh the browser:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
npm run dev
```

Use `Cmd + Shift + R` on macOS. A running server from before a code change will not contain newly added API routes.

### Port already in use

```bash
PORT=3001 npm run dev
```

Then use `http://localhost:3001` or `http://<host-ip>:3001`.

### Database unavailable

Check `/api/health/db`, verify `MONGO_URI`, check MongoDB Atlas IP allowlisting, and confirm the database user has permission to read/write the application database.

### Google sign-in unavailable

Check both Google variables, restart the server, and confirm the exact browser origin is registered in Google Cloud Console.

### Authentication appears stuck

Sign out, clear the site's local storage, or use a private window. Each browser/device stores its own development login session.

## 12. Security handoff notes

The current authentication model is intentionally small for development: the browser stores a user ID and sends it as a bearer token. Before public production use, add secure server-managed sessions or signed short-lived tokens, HTTPS, secret rotation, stronger password policy, audit-safe logging, and a restricted CORS origin.