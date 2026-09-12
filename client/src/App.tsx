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
import { StaffDirectory } from './routes/StaffDirectory';
import { StaffManagement } from './routes/StaffManagement';
import { KrawlSecurityAdmin } from './components/admin/KrawlSecurityAdmin';
import { getStoredAuthUser } from './lib/auth';
import { ForgotPassword, ResetPassword } from './routes/PasswordReset';
import { KnowledgeBase } from './routes/KnowledgeBase';
import { CustomerSatisfactionReport } from './routes/CustomerSatisfactionReport';
import { WorkflowLibrary } from './routes/WorkflowLibrary';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const authUser = getStoredAuthUser();
  if (!authUser) {
    return <Navigate to="/" replace />;
  }
  if (authUser.role === 'customer') return <Navigate to="/customer" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const authUser = getStoredAuthUser();
  if (!authUser) return <Navigate to="/" replace />;
  if (authUser.role !== 'admin') return <Navigate to="/tickets" replace />;
  return <>{children}</>;
}

function CustomerRoute({ children }: { children: React.ReactNode }) {
  const authUser = getStoredAuthUser();
  if (!authUser) return <Navigate to="/customer/login" replace />;
  if (authUser.role !== 'customer') return <Navigate to="/tickets" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/help" element={<KnowledgeBase />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route path="tickets" element={<TicketsDashboard />} />
            <Route path="tickets/new" element={<TicketFormRoute />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="tickets/:id/edit" element={<TicketFormRoute />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="profile" element={<StaffProfile />} />
            <Route
              path="staff"
              element={
                <AdminRoute>
                  <StaffDirectory />
                </AdminRoute>
              }
            />
            <Route
              path="staff-management"
              element={
                <AdminRoute>
                  <StaffManagement />
                </AdminRoute>
              }
            />
            <Route
              path="krawl"
              element={
                <AdminRoute>
                  <div className="max-w-6xl mx-auto px-4">
                    <h1 className="sr-only">Krawl dashboard</h1>
                    <KrawlSecurityAdmin />
                  </div>
                </AdminRoute>
              }
            />
            <Route
              path="reports/customer-satisfaction"
              element={
                <AdminRoute>
                  <CustomerSatisfactionReport />
                </AdminRoute>
              }
            />
            <Route
              path="workflow-library"
              element={
                <AdminRoute>
                  <WorkflowLibrary />
                </AdminRoute>
              }
            />
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
