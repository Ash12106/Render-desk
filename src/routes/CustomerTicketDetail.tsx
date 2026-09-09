import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/src/api';
import { StatusBadge, PriorityBadge } from '@/src/components/ui/Badge';
import { formatDate } from '@/src/lib/utils';

export function CustomerTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const tickets = useQuery({ queryKey: ['customer-tickets'], queryFn: api.getCustomerTickets });
  if (tickets.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  const ticket = tickets.data?.find((item) => item.id === id);
  if (!ticket)
    return (
      <div className="p-8 text-center">
        <p className="text-danger mb-4">Ticket not found.</p>
        <Link to="/customer" className="underline">
          Back to your support space
        </Link>
      </div>
    );
  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <Link to="/customer" className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase">
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </Link>
      <article className="bg-surface border-2 border-ink rounded-md p-6 md:p-8">
        <div className="flex flex-wrap gap-3 mb-5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="font-mono text-xs font-bold uppercase border border-ink rounded px-2 py-1">
            {ticket.category}
          </span>
        </div>
        <h1 className="text-3xl font-sans font-black text-ink mb-3">{ticket.title}</h1>
        <p className="text-sm text-ink-muted font-mono mb-8">Last updated {formatDate(ticket.updatedAt)}</p>
        <div className="bg-canvas border-2 border-ink rounded-md p-5 whitespace-pre-wrap text-ink">
          {ticket.description}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          Our support team will post progress updates here and notify you when the status changes.
        </p>
      </article>
    </div>
  );
}
