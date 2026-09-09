# Support Ops Desk

A modern, full-stack support ticket management system built to track team efficiency, manage customer queries, and provide a snappy, optimistic user experience.

## Features
- **Dashboard Overview**: Data visualization via Recharts detailing ticket distribution and resolution time.
- **Ticket Management**: Full CRUD capabilities for support tickets with real-time status transitions.
- **Customer Profiles**: Aggregated customer details and historical ticket tracking.
- **Optimistic UI**: Instantaneous frontend state updates (comments and status changes) with graceful rollback and error handling.
- **Responsive Design**: Polished, mobile-ready interface utilizing Tailwind CSS and Motion layout animations.

## Architectural Decisions

1. **Monolithic Repo Structure (Vite + Express)**:
   - **Why**: Allows for rapid iteration and unified deployment. The `server/index.ts` file boots the Express backend and integrates Vite middleware in development mode. In production, a single `npm run build` compiles both the React frontend and the ESBuild backend into the `/dist` directory.
2. **React + TypeScript + Tailwind CSS**:
   - **Why**: TypeScript ensures strict data contracts between the API and the UI. Tailwind CSS allows for rapid, utility-first UI construction without context switching to separate stylesheet files.
3. **MongoDB Database**:
   - **Why**: MongoDB (via Mongoose) provides a flexible document schema that is perfectly suited for tickets and comments, avoiding rigid SQL migrations while in the rapid prototyping phase.
4. **Optimistic Updates**:
   - **Why**: Network latency degrades the user experience. By updating the UI synchronously during mutations (like adding a comment) and reverting if the server throws an error, the application feels significantly faster and native.

## Getting Started

### Method 1: Docker (Recommended)
Spin up the entire application stack (Frontend, Backend, and MongoDB Database) with a single command:

```bash
docker-compose up --build
```
The app will be accessible at `http://localhost:3000`.

### Method 2: Local Development
If you prefer running the application natively:

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Environment Configuration**:
   Create a `.env` file in the root directory based on `.env.example`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/support-ops
   JWT_SECRET=your_super_secret_jwt_key
   ```
   *(Note: Ensure you have a local instance of MongoDB running on port 27017).*

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```

### Customer Google Sign-In
To enable Google sign-in on the customer login page, create a Web OAuth client in Google Cloud Console and add the same client ID to both variables:

```env
GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
```

Add `http://localhost:3000` to the OAuth client's authorized JavaScript origins. The backend verifies the Google ID token before creating or linking a customer account.

## API Endpoint Documentation

### Authentication
- `POST /api/auth/login`
  Authenticates a user and returns a signed JSON Web Token (JWT).

### Tickets
- `GET /api/tickets`
  Retrieves a paginated list of tickets. Accepts query parameters: `search`, `status`, `priority`, `customerId`, `limit`, `offset`, and `sort`.
- `GET /api/tickets/stats`
  Retrieves aggregate statistics for dashboard visualization (Status distribution, Priority counts, and average Resolution Time).
- `POST /api/tickets`
  Creates a new support ticket.
- `GET /api/tickets/:id`
  Retrieves a specific ticket by ID.
- `PUT /api/tickets/:id`
  Updates an existing ticket (e.g., status changes).
- `DELETE /api/tickets/:id`
  Permanently deletes a ticket.

### Customers
- `GET /api/customers`
  Retrieves a list of all customers.
- `GET /api/customers/:id/tickets`
  Retrieves a specific customer profile alongside their complete ticket history.

### Comments
- `GET /api/tickets/:id/comments`
  Retrieves the chronological list of comments for a specific ticket.
- `POST /api/tickets/:id/comments`
  Adds a new comment to a ticket.
