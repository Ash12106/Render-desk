import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Clock3, Plus } from 'lucide-react';
import { api } from '@/src/api';
import { Ticket } from '@/src/types';
import { StatusBadge, PriorityBadge } from '@/src/components/ui/Badge';
import { formatDate } from '@/src/lib/utils';

export function CustomerPortal() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['customer-profile'], queryFn: api.getCustomerProfile });
  const tickets = useQuery({
    queryKey: ['customer-tickets'],
    queryFn: api.getCustomerTickets,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const notifications = useQuery({
    queryKey: ['customer-notifications'],
    queryFn: api.getCustomerNotifications,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const markRead = useMutation({
    mutationFn: api.markCustomerNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-notifications'] }),
  });
  const deleteNotification = useMutation({
    mutationFn: api.deleteCustomerNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-notifications'] }),
  });
  const clearNotifications = useMutation({
    mutationFn: api.clearCustomerNotifications,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-notifications'] }),
  });

  if (profile.isPending || tickets.isPending)
    return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (profile.error || tickets.error)
    return <div className="p-8 text-center text-danger">Unable to load your support space.</div>;

  const active = (tickets.data || []).filter((ticket) => ticket.status === 'Open' || ticket.status === 'In Progress');
  const completed = (tickets.data || []).filter((ticket) => ticket.status === 'Resolved' || ticket.status === 'Closed');
  const ticketCard = (ticket: Ticket) => (
    <Link
      key={ticket.id}
      to={`/customer/tickets/${ticket.id}`}
      className="bg-surface border-2 border-ink rounded-md p-5 block hover:shadow-[4px_4px_0px_0px_rgba(23,32,43,1)] transition-shadow"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <PriorityBadge priority={ticket.priority} />
        <StatusBadge status={ticket.status} />
      </div>
      <h3 className="font-sans font-bold text-ink text-lg mb-2">{ticket.title}</h3>
      <p className="font-mono text-xs text-ink-muted uppercase">
        {ticket.category} · Updated {formatDate(ticket.updatedAt)}
      </p>
    </Link>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 space-y-8 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b-2 border-ink pb-6">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted mb-2">Customer portal</p>
          <h1 className="text-4xl font-sans font-black text-ink">Hello, {profile.data?.name}</h1>
          <p className="text-sm text-ink-muted mt-2">Track every request and keep your support history close.</p>
        </div>
        <Link
          to="/customer/tickets/new"
          className="inline-flex items-center gap-2 px-4 py-3 bg-ink text-white rounded-full font-mono text-xs font-bold uppercase"
        >
          <Plus className="w-4 h-4" /> Raise a ticket
        </Link>
      </div>

      {(notifications.data || []).length > 0 && (
        <section className="bg-surface border-2 border-ink rounded-md p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Updates for you</h2>
            </div>
            <button
              type="button"
              onClick={() => clearNotifications.mutate()}
              disabled={clearNotifications.isPending}
              className="font-mono text-[10px] font-bold uppercase underline disabled:opacity-50"
            >
              {clearNotifications.isPending ? 'Clearing...' : 'Clear notifications'}
            </button>
          </div>
          <div className="space-y-2">
            {notifications.data?.slice(0, 5).map((notification) => (
              <div
                key={notification.id}
                className={`w-full text-left p-3 border border-line rounded-md text-sm flex items-start justify-between gap-3 ${notification.readAt ? 'text-ink-muted' : 'font-bold text-ink bg-canvas'}`}
              >
                <button
                  type="button"
                  onClick={() => !notification.readAt && markRead.mutate(notification.id)}
                  className="text-left flex-1"
                >
                  {notification.message}
                  <span className="block text-[10px] font-mono uppercase text-ink-muted mt-1">
                    {formatDate(notification.createdAt)} · {notification.readAt ? 'Read' : 'Mark as read'}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Clear notification: ${notification.message}`}
                  title="Clear notification"
                  onClick={() => deleteNotification.mutate(notification.id)}
                  className="font-mono text-[10px] font-bold uppercase underline shrink-0"
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock3 className="w-4 h-4" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Ongoing tickets ({active.length})</h2>
        </div>
        {active.length ? (
          <div className="grid md:grid-cols-2 gap-4">{active.map(ticketCard)}</div>
        ) : (
          <p className="border-2 border-dashed border-ink p-8 text-center text-sm text-ink-muted">
            No ongoing tickets.
          </p>
        )}
      </section>
      <section>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider">
            Resolved and closed ({completed.length})
          </h2>
        </div>
        {completed.length ? (
          <div className="grid md:grid-cols-2 gap-4">{completed.map(ticketCard)}</div>
        ) : (
          <p className="border-2 border-dashed border-ink p-8 text-center text-sm text-ink-muted">
            Your resolved history will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
