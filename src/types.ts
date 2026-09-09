export type Priority = 'Low' | 'Medium' | 'High';
export type Status = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export type IssueCategory = 'Technical' | 'Sales' | 'Billing' | 'Account' | 'Other';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone?: string;
  customerCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  category: IssueCategory;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  notifyUser?: boolean;
  assignedTo?: string;
  // joined fields
  customerName?: string;
  customerEmail?: string | null;
}

export interface Comment {
  id: string;
  ticketId: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  ticketId: string;
  action: string;
  details: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'staff' | 'customer';
  customerId?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  team?: string;
  branch?: string;
  working?: number;
  solved?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerNotification {
  id: string;
  ticketId: string;
  type: 'STATUS_CHANGE';
  message: string;
  readAt?: string | null;
  createdAt: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
