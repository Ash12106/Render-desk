import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
  Columns3,
  GripVertical,
  Plus,
  Filter,
  Clock3,
  AlertTriangle,
  Check,
  ChevronsUpDown,
  X,
} from 'lucide-react';
import { api } from '@/src/api';
import { Ticket } from '@/src/types';
import { StatusBadge, PriorityBadge } from '@/src/components/ui/Badge';
import { formatDate, getSlaStatus } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, Clock, CheckSquare, Paperclip } from 'lucide-react';
import { useToast } from '@/src/components/ui/Toast';
import { getStoredAuthUser } from '@/src/lib/auth';
import { useWorkflowEvents } from '@/src/hooks/useWorkflowEvents';

const COLORS = ['#17202b', '#4a5568', '#a0aec0', '#e2e8f0'];
const PRIORITY_COLORS = {
  Critical: '#be123c',
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#10b981',
};

const PRIORITY_ROW_BORDERS = {
  Critical: 'border-l-danger',
  High: 'border-l-danger',
  Medium: 'border-l-warning',
  Low: 'border-l-success',
} as const;

const KANBAN_COLUMNS: Ticket['status'][] = ['Open', 'In Progress', 'Resolved', 'Closed'];
const DASHBOARD_REFRESH_INTERVAL = 15000;

export function TicketsDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Bulk Actions State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Filters
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const priority = searchParams.get('priority') || '';
  const customerId = searchParams.get('customerId') || '';

  // Pagination & Sorting
  const limit = 10;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const sortFields =
    searchParams
      .get('sort')
      ?.split(',')
      .filter((field) => ['date', 'priority', 'status'].includes(field)) || [];
  const sort = sortFields.join(',');
  const viewMode = searchParams.get('view') === 'kanban' ? 'kanban' : 'table';

  const updateSearchParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next);
  };

  const ticketsQuery = useQuery({
    queryKey: ['tickets', { search, status, priority, customerId, page, sort }],
    queryFn: () => api.getTickets({ search, status, priority, customerId, limit, offset: (page - 1) * limit, sort }),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });
  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: api.getCustomers,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });
  const currentUser = getStoredAuthUser();
  const staffProfileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: api.getProfile,
    enabled: currentUser?.role === 'staff',
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });
  const availabilityMutation = useMutation({
    mutationFn: api.updateAvailability,
    onMutate: async (isAvailable) => {
      await queryClient.cancelQueries({ queryKey: ['profile'] });
      const previousProfile = queryClient.getQueryData<typeof staffProfileQuery.data>(['profile']);
      if (previousProfile) queryClient.setQueryData(['profile'], { ...previousProfile, isAvailable });
      return { previousProfile };
    },
    onError: (error: Error, _isAvailable, context) => {
      if (context?.previousProfile) queryClient.setQueryData(['profile'], context.previousProfile);
      showToast(error.message || 'Could not update availability.', 'error');
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(['profile'], updatedProfile);
      localStorage.setItem('auth_user', JSON.stringify(updatedProfile));
      showToast(
        updatedProfile.isAvailable === false
          ? 'You are now unavailable for new assignments.'
          : 'You are available for new assignments.',
      );
    },
  });
  const adminUsersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.getAdminUsers,
    enabled: currentUser?.role === 'admin',
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });
  const statsQuery = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: api.getTicketStats,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });
  useWorkflowEvents(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
    }, [queryClient]),
  );
  const bulkStatusMutation = useMutation({
    mutationFn: ({ ticketIds, newStatus }: { ticketIds: string[]; newStatus: Ticket['status'] }) =>
      api.updateBulkStatus(ticketIds, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
    },
  });

  const tickets = ticketsQuery.data?.tickets || [];
  const total = ticketsQuery.data?.total || 0;
  const customers = customersQuery.data || [];
  const adminUsers = adminUsersQuery.data || [];
  const assignmentGroups = Array.from(
    new Set(
      adminUsers
        .filter((user) => user.role === 'staff')
        .map((user) => user.team)
        .filter(Boolean),
    ),
  );
  const stats = statsQuery.data || null;
  const loading = ticketsQuery.isPending || customersQuery.isPending || statsQuery.isPending;
  const error = ticketsQuery.error?.message || customersQuery.error?.message || statsQuery.error?.message || null;

  // Reset page and selections when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, status, priority, customerId]);

  // Reset selections when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, sort]);

  useEffect(() => {
    const closeSortMenu = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSortMenuOpen(false);
    };
    document.addEventListener('mousedown', closeSortMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeSortMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const hasFilters = search || status || priority || customerId;
  const getStatValue = (items: { name: string; value: number }[] | undefined, name: string) =>
    items?.find((item) => item.name === name)?.value || 0;
  const openCount = getStatValue(stats?.status, 'Open');
  const inProgressCount = getStatValue(stats?.status, 'In Progress');
  const activeRequests = openCount + inProgressCount;
  const highPriorityCount = getStatValue(stats?.priority, 'High');
  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const handleSort = (field: 'date' | 'priority' | 'status') => {
    const nextSortFields = sortFields.includes(field)
      ? sortFields.filter((currentField) => currentField !== field)
      : [...sortFields, field];
    updateSearchParams({ sort: nextSortFields.join(','), page: '' });
  };

  const sortLabels: Record<string, string> = { date: 'Newest', priority: 'Priority', status: 'Status' };
  const sortSummary = sortFields.length ? sortFields.map((field) => sortLabels[field]).join(', ') : 'Default';

  const handleExportCSV = () => {
    if (tickets.length === 0) return;

    const headers = ['ID', 'Title', 'Customer', 'Priority', 'Status', 'Due Date', 'Created At'];
    const rows = tickets.map((t) => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      `"${t.customerName || ''}"`,
      t.priority,
      t.status,
      t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : '',
      new Date(t.createdAt).toISOString().split('T')[0],
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tickets_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkStatusUpdate = async (newStatus: Ticket['status']) => {
    if (selectedIds.size === 0) return;
    try {
      const idsArray = Array.from(selectedIds) as string[];
      await bulkStatusMutation.mutateAsync({ ticketIds: idsArray, newStatus });
      showToast(`Successfully updated ${idsArray.length} tickets to ${newStatus}`);
      setSelectedIds(new Set());
    } catch (err: any) {
      showToast(err.message || 'Failed to update tickets', 'error');
    }
  };

  const isUpdatingBulk = bulkStatusMutation.isPending;
  const bulkAssignmentMutation = useMutation({
    mutationFn: (assignedTo: string) => api.assignTickets(Array.from(selectedIds), assignedTo),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
      showToast(
        `Assigned ${result.assignedCount} ticket${result.assignedCount === 1 ? '' : 's'} to the selected staff member.`,
      );
      setSelectedIds(new Set());
    },
  });

  const handleBulkAssignment = async (assignedTo: string) => {
    if (!assignedTo || selectedIds.size === 0) return;
    try {
      await bulkAssignmentMutation.mutateAsync(assignedTo);
    } catch (err: any) {
      showToast(err.message || 'Failed to assign tickets', 'error');
    }
  };

  const handleKanbanStatusChange = async (ticket: Ticket, newStatus: Ticket['status']) => {
    if (ticket.status === newStatus || ticket.status === 'Closed') return;
    try {
      await api.updateTicket(ticket.id, { ...ticket, status: newStatus, notifyUser: true });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
      showToast(`Ticket moved to ${newStatus}`);
    } catch (err: any) {
      showToast(err.message || 'Unable to update ticket status', 'error');
    } finally {
      setDraggedTicketId(null);
    }
  };

  const handleKanbanDrop = (newStatus: Ticket['status']) => {
    if (!draggedTicketId) return;
    const ticket = tickets.find((item) => item.id === draggedTicketId);
    if (ticket) void handleKanbanStatusChange(ticket, newStatus);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20 relative min-h-[calc(100vh-100px)]"
    >
      {/* Queue summary */}
      <section className="bg-surface border-2 border-ink rounded-md px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-[10px] sm:text-xs font-mono font-bold text-ink-muted uppercase tracking-[0.2em] mb-3">
              Support operations
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              {currentUser?.role === 'staff' ? 'My assigned work' : 'Ticket queue'}
            </h1>
            <p className="text-sm text-ink-muted mt-2 max-w-xl">
              Prioritize open work, keep customer commitments visible, and move each request toward resolution.
            </p>
          </div>
          <Link
            to="/tickets/new"
            className="inline-flex items-center justify-center gap-2 bg-ink text-white rounded-full px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider hover:bg-ink/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create ticket
          </Link>
          {currentUser?.role === 'staff' && (
            <label className="inline-flex items-center gap-3 border-2 border-ink rounded-full px-4 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                aria-label="Available for new assignments"
                checked={staffProfileQuery.data?.isAvailable !== false}
                disabled={availabilityMutation.isPending || staffProfileQuery.isPending}
                onChange={(event) => availabilityMutation.mutate(event.target.checked)}
                className="h-4 w-4 accent-success"
              />
              <span className="text-xs font-mono font-bold uppercase">
                {staffProfileQuery.data?.isAvailable !== false ? 'Available' : 'Unavailable'}
              </span>
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-7 pt-5 border-t border-line">
          <div className="flex items-center gap-3">
            <Clock3 className="w-4 h-4 text-ink-muted" />
            <div>
              <p className="font-mono text-[10px] uppercase text-ink-muted">Active now</p>
              <p className="text-xl font-black">{stats ? activeRequests : total}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-ink-muted" />
            <div>
              <p className="font-mono text-[10px] uppercase text-ink-muted">Open / working</p>
              <p className="text-xl font-black">
                {openCount} / {inProgressCount}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-danger" />
            <div>
              <p className="font-mono text-[10px] uppercase text-ink-muted">High priority</p>
              <p className="text-xl font-black">{highPriorityCount}</p>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-ink-muted">Customers</p>
            <p className="text-xl font-black">{customers.length}</p>
          </div>
        </div>
        {hasFilters && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 bg-surface-muted/50 border border-line rounded-md px-3 py-2.5">
            <p className="text-xs text-ink-muted">
              Showing <span className="font-bold text-ink">{total}</span> matching {total === 1 ? 'ticket' : 'tickets'}
            </p>
            <button type="button" onClick={clearFilters} className="text-xs font-mono font-bold uppercase underline">
              Clear filters
            </button>
          </div>
        )}
      </section>

      <div className="px-4 sm:px-6">
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-surface border-2 border-ink rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(23,32,43,1)]">
              <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-wider mb-6 text-center">
                Ticket Status Distribution
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.status}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      label
                    >
                      {stats.status.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #17202b',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                      itemStyle={{ color: '#17202b' }}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-surface border-2 border-ink rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(23,32,43,1)]">
              <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-wider mb-6 text-center">
                Priority Overview
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.priority}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontFamily: 'monospace', fontSize: '12px', fill: '#17202b', fontWeight: 'bold' }}
                      tickLine={false}
                      axisLine={{ stroke: '#17202b', strokeWidth: 2 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontFamily: 'monospace', fontSize: '12px', fill: '#17202b', fontWeight: 'bold' }}
                      tickLine={false}
                      axisLine={{ stroke: '#17202b', strokeWidth: 2 }}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #17202b',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                      itemStyle={{ color: '#17202b' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {stats.priority.map((entry) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS] || COLORS[0]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-surface border-2 border-ink rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(23,32,43,1)]">
              <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-wider mb-6 text-center">
                Avg Resolution (Hours)
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.resolution}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontFamily: 'monospace', fontSize: '12px', fill: '#17202b', fontWeight: 'bold' }}
                      tickLine={false}
                      axisLine={{ stroke: '#17202b', strokeWidth: 2 }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontFamily: 'monospace', fontSize: '12px', fill: '#17202b', fontWeight: 'bold' }}
                      tickLine={false}
                      axisLine={{ stroke: '#17202b', strokeWidth: 2 }}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #17202b',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                      itemStyle={{ color: '#17202b' }}
                      formatter={(value) => [`${value} hrs`, 'Average']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {stats.resolution.map((entry) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS] || COLORS[0]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
            <input
              type="text"
              aria-label="Search tickets by title or customer"
              placeholder="Search by title or customer..."
              value={search}
              onChange={(e) => updateSearchParams({ search: e.target.value, page: '' })}
              className="w-full h-11 pl-10 pr-10 bg-surface border-2 border-ink rounded-md text-sm font-medium text-ink placeholder:text-ink-muted/80 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy transition-colors"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear ticket search"
                onClick={() => updateSearchParams({ search: '', page: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-muted hover:bg-line/30 hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <select
            aria-label="Filter tickets by status"
            value={status}
            onChange={(e) => updateSearchParams({ status: e.target.value, page: '' })}
            className="px-4 py-2 bg-surface border-2 border-ink rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-navy cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
          <select
            aria-label="Filter tickets by priority"
            value={priority}
            onChange={(e) => updateSearchParams({ priority: e.target.value, page: '' })}
            className="px-4 py-2 bg-surface border-2 border-ink rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-navy cursor-pointer"
          >
            <option value="">All Priorities</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <div ref={sortMenuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isSortMenuOpen}
              aria-label="Sort tickets by multiple fields"
              onClick={() => setIsSortMenuOpen((open) => !open)}
              className="min-w-[9.5rem] flex items-center justify-between gap-3 px-3 py-2 bg-surface border-2 border-ink rounded-md text-xs font-mono font-bold uppercase hover:bg-line/20 transition-colors"
            >
              <span className="flex flex-col items-start min-w-0">
                <span className="text-[10px] text-ink-muted">Sort by</span>
                <span className="normal-case truncate max-w-[8rem]">{sortSummary}</span>
              </span>
              <ChevronsUpDown className="w-4 h-4 shrink-0" />
            </button>
            {isSortMenuOpen && (
              <div
                role="menu"
                aria-label="Sort options"
                className="absolute z-20 right-0 mt-2 w-52 bg-surface border-2 border-ink rounded-md p-2 shadow-[4px_4px_0px_0px_rgba(23,32,43,1)]"
              >
                <p className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Add sort criteria
                </p>
                {(['date', 'priority', 'status'] as const).map((field) => (
                  <label
                    key={field}
                    className="flex items-center gap-3 px-2 py-2 rounded hover:bg-line/20 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={sortFields.includes(field)}
                      onChange={() => handleSort(field)}
                      className="w-4 h-4 accent-ink"
                    />
                    <span className="flex-1">{sortLabels[field]}</span>
                    {sortFields.includes(field) && <Check className="w-4 h-4" />}
                  </label>
                ))}
                <button
                  type="button"
                  disabled={!sortFields.length}
                  onClick={() => updateSearchParams({ sort: '', page: '' })}
                  className="w-full mt-1 pt-2 border-t border-line text-left px-2 text-xs font-mono font-bold uppercase underline disabled:opacity-40 disabled:no-underline"
                >
                  Clear sorting
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleExportCSV}
            disabled={tickets.length === 0}
            className="px-4 py-2 bg-surface border-2 border-ink rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-navy flex items-center justify-center gap-2 hover:bg-line/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-ink whitespace-nowrap"
            title="Export current page to CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <div
            className="flex items-center gap-1 border-2 border-ink rounded-md p-1 bg-surface"
            role="group"
            aria-label="Dashboard view"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              onClick={() => updateSearchParams({ view: '' })}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase rounded ${viewMode === 'table' ? 'bg-ink text-white' : 'text-ink'}`}
            >
              Table
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'kanban'}
              onClick={() => updateSearchParams({ view: 'kanban' })}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-bold uppercase rounded ${viewMode === 'kanban' ? 'bg-ink text-white' : 'text-ink'}`}
            >
              <Columns3 className="w-3.5 h-3.5" /> Kanban
            </button>
          </div>
        </div>

        {error ? (
          <div className="p-8 text-center bg-danger-bg border border-danger/20 rounded-md mb-6">
            <p className="text-danger mb-4 font-mono text-sm">{error}</p>
            <button
              onClick={() => ticketsQuery.refetch()}
              className="px-6 py-2 bg-ink text-white rounded-full text-xs font-mono font-bold uppercase tracking-wider hover:bg-ink/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="animate-pulse space-y-4 mb-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-surface border-2 border-line rounded-md"></div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center border-2 border-ink border-dashed rounded-md mb-6">
            {hasFilters ? (
              <>
                <p className="mb-4 font-mono text-sm text-ink-muted">No tickets match your filters.</p>
                <button
                  onClick={clearFilters}
                  className="text-ink font-mono text-sm font-bold hover:underline uppercase tracking-wider"
                >
                  Reset filters
                </button>
              </>
            ) : (
              <>
                <p className="mb-4 font-mono text-sm text-ink-muted">No tickets exist yet.</p>
                <Link
                  to="/tickets/new"
                  className="text-ink font-mono text-sm font-bold hover:underline uppercase tracking-wider"
                >
                  Create your first ticket
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="bg-surface border-2 border-ink rounded-md p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[4px_4px_0px_0px_rgba(23,32,43,1)] overflow-hidden"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-line/30 flex items-center justify-center">
                      <CheckSquare className="w-4 h-4 text-ink" />
                    </div>
                    <span className="font-mono text-sm font-bold text-ink">
                      {selectedIds.size} ticket{selectedIds.size > 1 ? 's' : ''} selected
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <span className="font-mono text-xs font-bold text-ink-muted uppercase tracking-wider">
                      Update status:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {currentUser?.role === 'admin' && (
                        <select
                          aria-label="Assign selected tickets to staff"
                          defaultValue=""
                          disabled={bulkAssignmentMutation.isPending}
                          onChange={(event) => void handleBulkAssignment(event.target.value)}
                          className="bg-canvas border border-line rounded-md px-3 py-1.5 text-xs font-mono font-bold uppercase disabled:opacity-50"
                        >
                          <option value="">Assign to staff...</option>
                          {adminUsers
                            .filter((user) => user.role === 'staff')
                            .map((user) => (
                              <option key={user.id} value={user.id} disabled={user.isAvailable === false}>
                                {user.displayName || user.username} {user.isAvailable === false ? '(Unavailable)' : ''}
                              </option>
                            ))}
                        </select>
                      )}
                      {currentUser?.role !== 'admin' &&
                        ['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => (
                          <button
                            key={s}
                            onClick={() => handleBulkStatusUpdate(s as any)}
                            disabled={isUpdatingBulk}
                            className="px-3 py-1.5 bg-canvas border border-line rounded-md text-xs font-mono font-bold text-ink uppercase tracking-wider hover:bg-line/20 transition-colors disabled:opacity-50"
                          >
                            {s}
                          </button>
                        ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {viewMode === 'kanban' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Ticket kanban board">
                {KANBAN_COLUMNS.map((column) => {
                  const columnTickets = tickets.filter((ticket) => ticket.status === column);
                  const isDropTarget = currentUser?.role !== 'admin' && column !== 'Closed';
                  return (
                    <section
                      key={column}
                      aria-label={`${column} tickets`}
                      onDragOver={(event) => {
                        if (isDropTarget) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (isDropTarget) handleKanbanDrop(column);
                      }}
                      className={`min-h-[280px] bg-surface border-2 border-ink rounded-md p-3 shadow-[4px_4px_0px_0px_rgba(23,32,43,1)] ${isDropTarget && draggedTicketId ? 'bg-line/20' : ''}`}
                    >
                      <div className="flex items-center justify-between border-b-2 border-ink pb-3 mb-3">
                        <h2 className="font-mono text-xs font-bold uppercase tracking-wider">{column}</h2>
                        <span className="font-mono text-xs font-bold text-ink-muted">{columnTickets.length}</span>
                      </div>
                      <div className="space-y-3">
                        {columnTickets.map((ticket) => (
                          <article
                            key={ticket.id}
                            draggable={currentUser?.role !== 'admin' && ticket.status !== 'Closed'}
                            onDragStart={() => setDraggedTicketId(ticket.id)}
                            onDragEnd={() => setDraggedTicketId(null)}
                            className={`bg-canvas border-2 border-ink border-l-4 ${PRIORITY_ROW_BORDERS[ticket.priority]} rounded-md p-3 ${currentUser?.role !== 'admin' && ticket.status !== 'Closed' ? 'cursor-grab active:cursor-grabbing' : 'opacity-80'}`}
                          >
                            <button
                              type="button"
                              onClick={() => navigate(`/tickets/${ticket.id}`)}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono text-[10px] text-ink-muted">
                                  #{ticket.id.toString().slice(-4)}
                                </span>
                                <GripVertical className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                              </div>
                              <h3 className="font-sans font-bold text-ink text-sm mt-2 line-clamp-2">{ticket.title}</h3>
                              <p className="font-sans text-xs text-ink-muted mt-2">{ticket.customerName}</p>
                              <div className="flex items-center justify-between gap-2 mt-3">
                                <PriorityBadge priority={ticket.priority} />
                                <span className="font-mono text-[10px] uppercase text-ink-muted">
                                  {ticket.category}
                                </span>
                              </div>
                              {ticket.attachments && ticket.attachments.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ink-muted">
                                    <Paperclip className="w-3 h-3" /> {ticket.attachments.length} file
                                    {ticket.attachments.length > 1 ? 's' : ''}
                                  </span>
                                </div>
                              )}
                            </button>
                            {ticket.attachments && ticket.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
                                {ticket.attachments.map((attachment) => (
                                  <a
                                    key={`${attachment.name}-${attachment.size}`}
                                    href={attachment.data}
                                    download={attachment.name}
                                    title={`Download ${attachment.name}`}
                                    className="max-w-full truncate rounded border border-ink px-2 py-1 text-[10px] font-mono hover:bg-ink hover:text-white"
                                  >
                                    {attachment.name}
                                  </a>
                                ))}
                              </div>
                            )}
                            {currentUser?.role !== 'admin' && ticket.status !== 'Closed' && (
                              <select
                                aria-label={`Move ${ticket.title} to status`}
                                value={ticket.status}
                                onChange={(event) =>
                                  void handleKanbanStatusChange(ticket, event.target.value as Ticket['status'])
                                }
                                className="mt-3 w-full bg-surface border border-ink rounded px-2 py-1 text-[10px] font-mono font-bold uppercase"
                              >
                                {KANBAN_COLUMNS.filter((statusOption) => statusOption !== 'Closed').map(
                                  (statusOption) => (
                                    <option key={statusOption}>{statusOption}</option>
                                  ),
                                )}
                              </select>
                            )}
                          </article>
                        ))}
                        {columnTickets.length === 0 && (
                          <p className="border border-dashed border-ink p-4 text-center font-mono text-[10px] uppercase text-ink-muted">
                            Drop tickets here
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="bg-surface border-2 border-ink rounded-md overflow-x-auto shadow-[4px_4px_0px_0px_rgba(23,32,43,1)]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-ink bg-line/20">
                      <th className="p-4 w-12 text-center">
                        <input
                          aria-label="Select all tickets"
                          type="checkbox"
                          checked={tickets.length > 0 && selectedIds.size === tickets.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(tickets.map((t) => t.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                          className="w-4 h-4 cursor-pointer accent-navy rounded-sm border-2 border-ink"
                        />
                      </th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">ID</th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider min-w-[200px]">
                        Title
                      </th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider min-w-[150px]">
                        Customer
                      </th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort('priority')}
                          aria-pressed={sortFields.includes('priority')}
                          className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                        >
                          Priority <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">Status</th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">Activity</th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">Assigned</th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">Files</th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">SLA / Due</th>
                      <th className="p-4 font-mono text-xs font-bold text-ink uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort('date')}
                          aria-pressed={sortFields.includes('date')}
                          className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                        >
                          Date <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {tickets.length === 0 ? (
                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b-2 border-line">
                          <td colSpan={11} className="p-8 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <CheckSquare className="w-8 h-8 text-ink-muted" />
                              <p className="font-sans font-bold text-ink">No tickets found.</p>
                              <p className="text-sm text-ink-muted">Try adjusting your filters or search term.</p>
                            </div>
                          </td>
                        </motion.tr>
                      ) : (
                        tickets.map((ticket, idx) => (
                          <motion.tr
                            key={ticket.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(idx * 0.05, 0.3) }}
                            className="border-b-2 border-line hover:bg-line/10 transition-colors cursor-pointer group"
                            onClick={() => navigate(`/tickets/${ticket.id}`)}
                          >
                            <td
                              className={`p-4 w-12 text-center border-l-4 ${PRIORITY_ROW_BORDERS[ticket.priority]}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.has(ticket.id)}
                                onChange={(e) => {
                                  const newSet = new Set(selectedIds);
                                  if (e.target.checked) newSet.add(ticket.id);
                                  else newSet.delete(ticket.id);
                                  setSelectedIds(newSet);
                                }}
                                className="w-4 h-4 cursor-pointer accent-navy rounded-sm border-2 border-ink"
                              />
                            </td>
                            <td className="p-4 font-mono text-xs text-ink-muted group-hover:text-ink transition-colors">
                              #{ticket.id.toString().slice(-4)}
                            </td>
                            <td className="p-4">
                              <span className="font-sans font-bold text-ink text-sm line-clamp-1">{ticket.title}</span>
                            </td>
                            <td className="p-4 font-sans text-sm text-ink-muted">{ticket.customerName}</td>
                            <td className="p-4">
                              <PriorityBadge priority={ticket.priority} />
                            </td>
                            <td className="p-4">
                              <StatusBadge status={ticket.status} />
                            </td>
                            <td className="p-4">
                              <span className="inline-flex max-w-[170px] items-center gap-1.5 text-xs font-medium text-ink-muted">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${ticket.activityStatus === 'Unread' ? 'bg-danger' : ticket.activityStatus === 'Awaiting technician response' ? 'bg-warning' : 'bg-success'}`}
                                />
                                <span className="truncate">{ticket.activityStatus || 'Unread'}</span>
                              </span>
                            </td>
                            <td className="p-4" onClick={(event) => event.stopPropagation()}>
                              {currentUser?.role === 'admin' ? (
                                <div className="flex flex-col gap-1">
                                  <select
                                    aria-label={`Assign group for ${ticket.title}`}
                                    value={ticket.assignedGroup || ''}
                                    onChange={async (event) => {
                                      await api.assignTicket(ticket.id, {
                                        assignedTo:
                                          (ticket as any).assignedTo?.id || (ticket as any).assignedTo || null,
                                        assignedGroup: event.target.value || null,
                                      });
                                      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
                                    }}
                                    className="max-w-[150px] border border-ink rounded px-2 py-1 text-xs font-mono"
                                  >
                                    <option value="">No group</option>
                                    {assignmentGroups.map((group) => (
                                      <option key={group} value={group}>
                                        {group}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    aria-label={`Assign staff for ${ticket.title}`}
                                    value={(ticket as any).assignedTo?.id || (ticket as any).assignedTo || ''}
                                    onChange={async (event) => {
                                      const staff = adminUsers.find((user) => user.id === event.target.value);
                                      await api.assignTicket(ticket.id, {
                                        assignedTo: event.target.value || null,
                                        assignedGroup: ticket.assignedGroup || staff?.team || null,
                                      });
                                      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
                                    }}
                                    className="max-w-[150px] border border-ink rounded px-2 py-1 text-xs font-mono"
                                  >
                                    <option value="">Unassigned</option>
                                    {adminUsers
                                      .filter((user) => user.role === 'staff')
                                      .map((user) => (
                                        <option key={user.id} value={user.id} disabled={user.isAvailable === false}>
                                          {user.displayName || user.username}{' '}
                                          {user.isAvailable === false ? '(Unavailable)' : '(Available)'}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              ) : (
                                <span className="text-xs font-mono text-ink-muted">
                                  {ticket.assignedGroup || 'Assigned task'}
                                </span>
                              )}
                            </td>
                            <td className="p-4" onClick={(event) => event.stopPropagation()}>
                              {ticket.attachments && ticket.attachments.length > 0 ? (
                                <div className="flex flex-col items-start gap-1">
                                  <span className="inline-flex items-center gap-1 text-xs font-mono text-ink-muted">
                                    <Paperclip className="w-3 h-3" />
                                    {ticket.attachments.length}
                                  </span>
                                  {ticket.attachments.map((attachment) => (
                                    <a
                                      key={`${attachment.name}-${attachment.size}`}
                                      href={attachment.data}
                                      download={attachment.name}
                                      className="max-w-[140px] truncate text-[10px] font-mono underline hover:text-navy"
                                      title={attachment.name}
                                    >
                                      {attachment.name}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-ink-muted">None</span>
                              )}
                            </td>
                            <td className="p-4">
                              {ticket.status !== 'Resolved' &&
                              ticket.status !== 'Closed' &&
                              (ticket.slaDueAt || ticket.dueDate) ? (
                                <div
                                  className={`flex items-center gap-1.5 font-mono text-xs font-bold ${
                                    getSlaStatus(ticket.slaDueAt || ticket.dueDate!) === 'overdue'
                                      ? 'text-danger'
                                      : getSlaStatus(ticket.slaDueAt || ticket.dueDate!) === 'warning'
                                        ? 'text-warning'
                                        : 'text-ink-muted'
                                  }`}
                                >
                                  {getSlaStatus(ticket.slaDueAt || ticket.dueDate!) === 'overdue' ? (
                                    <AlertCircle className="w-4 h-4" />
                                  ) : (
                                    <Clock className="w-4 h-4" />
                                  )}
                                  {ticket.slaDueAt ? `SLA ${formatDate(ticket.slaDueAt)}` : formatDate(ticket.dueDate!)}
                                </div>
                              ) : (
                                <span className="font-mono text-xs text-ink-muted/50">—</span>
                              )}
                            </td>
                            <td className="p-4 font-mono text-xs text-ink-muted whitespace-nowrap">
                              {formatDate(ticket.createdAt)}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <div className="p-4 border-t-2 border-ink flex items-center justify-between bg-surface">
                  <span className="font-mono text-xs text-ink-muted font-bold uppercase">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page === 1 || isUpdatingBulk}
                      onClick={() => updateSearchParams({ page: String(Math.max(1, page - 1)) })}
                      className="p-2 border-2 border-ink rounded-md text-ink disabled:opacity-50 disabled:cursor-not-allowed hover:bg-line/20 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={page === totalPages || isUpdatingBulk}
                      onClick={() => updateSearchParams({ page: String(Math.min(totalPages, page + 1)) })}
                      className="p-2 border-2 border-ink rounded-md text-ink disabled:opacity-50 disabled:cursor-not-allowed hover:bg-line/20 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Link
        to="/tickets/new"
        className="fixed bottom-8 right-8 bg-ink text-white rounded-full pl-4 pr-6 py-4 flex items-center gap-3 shadow-none hover:shadow-[6px_6px_0px_0px_rgba(23,32,43,0.7)] hover:-translate-y-1 transition-all z-50 group"
      >
        <div className="w-6 h-6 rounded-full bg-white text-ink flex items-center justify-center font-bold text-lg leading-none">
          +
        </div>
        <span className="font-mono text-sm font-bold tracking-wider uppercase">New Ticket</span>
      </Link>
    </motion.div>
  );
}
