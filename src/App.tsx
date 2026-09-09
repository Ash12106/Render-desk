/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/ui/Layout';
import { CustomerLayout } from './components/ui/CustomerLayout';
import { ToastProvider } from './components/ui/Toast';
import { TicketsDashboard } from './routes/TicketsDashboard';
import { TicketDetail } from './routes/TicketDetail';
import { TicketFormRoute } from './routes/TicketFormRoute';
import { CustomerDetail } from './routes/CustomerDetail';
import { Login } from './routes/Login';
import { CustomerLogin } from './routes/CustomerLogin';
import { CustomerPortal } from './routes/CustomerPortal';
import { CustomerTicketFormRoute } from './routes/CustomerTicketFormRoute';
import { CustomerTicketDetail } from './routes/CustomerTicketDetail';
import { StaffProfile } from './routes/StaffProfile';
import { CustomerProfile } from './routes/CustomerProfile';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const authUser = JSON.parse(localStorage.getItem('auth_user') || 'null');
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }
  if (authUser.role === 'customer') return <Navigate to="/customer" replace />;
  return <>{children}</>;
}

function CustomerRoute({ children }: { children: React.ReactNode }) {
  const authUser = JSON.parse(localStorage.getItem('auth_user') || 'null');
  if (!authUser) return <Navigate to="/customer/login" replace />;
  if (authUser.role !== 'customer') return <Navigate to="/tickets" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/tickets" replace />} />
            <Route path="tickets" element={<TicketsDashboard />} />
            <Route path="tickets/new" element={<TicketFormRoute />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="tickets/:id/edit" element={<TicketFormRoute />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="profile" element={<StaffProfile />} />
            <Route
              path="*"
              element={
                <div className="py-20 text-center">
                  <h2 className="text-2xl font-serif font-medium text-ink mb-2">404 - Not Found</h2>
                  <p className="text-ink-muted">The page you are looking for does not exist.</p>
                </div>
              }
            />
          </Route>
          <Route
            path="/customer"
            element={
              <CustomerRoute>
                <CustomerLayout />
              </CustomerRoute>
            }
          >
            <Route index element={<CustomerPortal />} />
            <Route path="profile" element={<CustomerProfile />} />
            <Route path="tickets/new" element={<CustomerTicketFormRoute />} />
            <Route path="tickets/:id" element={<CustomerTicketDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
