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
  tags?: string[];
  slaDueAt?: string | null;
  slaBreached?: boolean;
  escalationLevel?: number;
  escalationReason?: string;
  escalatedAt?: string | null;
  reopenCount?: number;
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

export interface InternalNote {
  id: string;
  ticketId: string;
  author: string;
  content: string;
  createdAt: string;
}
export interface CannedReply {
  id: string;
  title: string;
  content: string;
  category: string;
}
export interface SatisfactionResponse {
  id: string;
  score: number;
  comment: string;
  createdAt: string;
}
export interface SatisfactionReport {
  responses: number;
  averageScore: number;
  fiveStar: number;
  recent: Array<SatisfactionResponse & { ticketId?: { title?: string }; customerId?: { name?: string } }>;
}
export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
