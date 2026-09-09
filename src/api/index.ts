import { Ticket, Customer, Comment, User, AuditLog, CustomerNotification } from '../types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const authUserStr = localStorage.getItem('auth_user');
  const authHeader: Record<string, string> = {};
  if (authUserStr) {
    try {
      const user = JSON.parse(authUserStr);
      if (user?.id) {
        authHeader['Authorization'] = `Bearer ${user.id}`;
      }
    } catch {
      // Ignore malformed local auth state and continue without authentication.
    }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options?.headers,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (data && data.success === false) {
      const err = new Error(data.message) as any;
      if (data.fields) err.code = 'VALIDATION_ERROR';
      if (data.fields) err.fields = data.fields;
      throw err;
    }
    if (data?.error) {
      throw data.error;
    }
    if (res.status === 404 && url.includes('/api/profile/availability')) {
      throw new Error('The running server is outdated. Restart the development server and try again.');
    }
    throw new Error(`Request failed (${res.status}). Please try again.`);
  }

  if (data && data.success === true && data.data !== undefined) {
    return data.data as T;
  }

  return data as T;
}

export const api = {
  getTicketStats: () => {
    return fetchJson<{
      status: { name: string; value: number }[];
      priority: { name: string; value: number }[];
      resolution: { name: string; value: number }[];
    }>('/api/tickets/stats');
  },

  getTickets: (params?: {
    search?: string;
    status?: string;
    priority?: string;
    customerId?: string;
    limit?: number;
    offset?: number;
    sort?: string;
  }) => {
    const url = new URL('/api/tickets', window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }
    return fetchJson<{ tickets: Ticket[]; total: number }>(url.toString());
  },

  getTicket: (id: string | number) => {
    return fetchJson<{ ticket: Ticket; comments: Comment[]; logs: AuditLog[] }>(`/api/tickets/${id}`);
  },

  createTicket: (data: Partial<Ticket>) => {
    return fetchJson<Ticket>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createCustomerTicket: (data: Partial<Ticket>) => {
    return fetchJson<Ticket>('/api/customer/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTicket: (id: string | number, data: Partial<Ticket> & { notifyUser?: boolean }) => {
    return fetchJson<Ticket>(`/api/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  updateActivityStatus: (id: string | number, activityStatus: Ticket['activityStatus']) =>
    fetchJson<Ticket>(`/api/tickets/${id}/activity-status`, {
      method: 'PATCH',
      body: JSON.stringify({ activityStatus }),
    }),

  updateBulkStatus: (ticketIds: string[], status: Ticket['status']) => {
    return fetchJson<{ success: boolean; updatedCount: number }>('/api/tickets/bulk-status', {
      method: 'PUT',
      body: JSON.stringify({ ticketIds, status }),
    });
  },

  deleteTicket: (id: string | number) => {
    return fetchJson<void>(`/api/tickets/${id}`, {
      method: 'DELETE',
    });
  },

  getCustomers: () => {
    return fetchJson<Customer[]>('/api/customers');
  },

  getCustomerWithTickets: (id: string | number) => {
    return fetchJson<{ customer: Customer; tickets: Ticket[] }>(`/api/customers/${id}/tickets`);
  },

  getComments: (ticketId: string | number) => {
    return fetchJson<Comment[]>(`/api/tickets/${ticketId}/comments`);
  },

  createComment: (ticketId: string | number, data: { content: string; author: string }) => {
    return fetchJson<Comment>(`/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login: (data: { username: string; password: string }) => {
    return fetchJson<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  registerCustomer: (data: { name: string; email: string; username: string; password: string }) => {
    return fetchJson<User>('/api/customer-auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  loginWithGoogle: (credential: string) =>
    fetchJson<User>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential, accountType: 'customer' }),
    }),
  loginStaffWithGoogle: (credential: string) =>
    fetchJson<User>('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential, accountType: 'staff' }) }),
  getProfile: () => fetchJson<User>('/api/profile'),
  updateProfile: (data: { displayName: string; email: string; phone?: string }) =>
    fetchJson<User>('/api/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  updateAvailability: (isAvailable: boolean) =>
    fetchJson<User>('/api/profile/availability', { method: 'PATCH', body: JSON.stringify({ isAvailable }) }),
  updateStaffDetails: (
    id: string,
    data: { displayName: string; email: string; phone?: string; team: string; branch: string },
  ) => fetchJson<User>(`/api/admin/users/${id}/details`, { method: 'PATCH', body: JSON.stringify(data) }),
  assignTicket: (id: string, assignment: { assignedTo: string | null; assignedGroup: string | null }) =>
    fetchJson<Ticket>(`/api/admin/tickets/${id}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify(assignment),
    }),
  assignTickets: (ticketIds: string[], assignedTo: string) =>
    fetchJson<{ success: boolean; assignedCount: number; assignedGroup: string }>('/api/admin/tickets/assignment', {
      method: 'PATCH',
      body: JSON.stringify({ ticketIds, assignedTo }),
    }),
  getAdminUsers: () => fetchJson<User[]>('/api/admin/users'),
  createStaffAccount: (data: {
    username: string;
    password: string;
    displayName: string;
    email: string;
    phone?: string;
    team: string;
    branch: string;
    role?: 'admin' | 'staff';
  }) => fetchJson<User>('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateStaffRole: (id: string, role: 'admin' | 'staff') =>
    fetchJson<User>(`/api/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  getCustomerProfile: () => fetchJson<Customer>('/api/customer/profile'),
  updateCustomerProfile: (data: { name: string; email: string; phone?: string }) =>
    fetchJson<Customer>('/api/customer/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  getCustomerTickets: () => fetchJson<Ticket[]>('/api/customer/tickets'),
  getCustomerNotifications: () => fetchJson<CustomerNotification[]>('/api/customer/notifications'),
  markCustomerNotificationRead: (id: string) =>
    fetchJson<CustomerNotification>(`/api/customer/notifications/${id}/read`, { method: 'PATCH' }),
  deleteCustomerNotification: (id: string) =>
    fetchJson<void>(`/api/customer/notifications/${id}`, { method: 'DELETE' }),
  clearCustomerNotifications: () =>
    fetchJson<{ success: boolean; deletedCount: number }>('/api/customer/notifications', { method: 'DELETE' }),
};
