export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type Status = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export type ActivityStatus = 'Unread' | 'Read' | 'Awaiting customer response' | 'Awaiting technician response';
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
  activityStatus?: ActivityStatus;
  category: IssueCategory;
  assignmentType?: 'Incident' | 'Problem' | 'Request' | 'Change';
  contract?: string;
  ticketForm?: string;
  impact?: 'No Impact' | 'Site Down' | 'Server Issue' | 'Minor' | 'Major' | 'Crisis';
  productFamily?: string;
  attachments?: TicketAttachment[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  notifyUser?: boolean;
  assignedGroup?: string;
  assignedTo?: string;
  assignedStaffName?: string;
  // joined fields
  customerName?: string;
  customerEmail?: string | null;
}

export interface TicketAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
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
  googleId?: string;
  customerId?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  team?: string;
  branch?: string;
  isAvailable?: boolean;
  joiningDate?: string;
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
