import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/src/api';
import { Customer, Ticket } from '@/src/types';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { StatusBadge, PriorityBadge } from '@/src/components/ui/Badge';
import { formatDate } from '@/src/lib/utils';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getCustomerWithTickets(id);
        setCustomer(data.customer);
        setTickets(data.tickets);
      } catch (err: any) {
        setError(err.message || 'Customer not found');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8"></div>;
  }

  if (error || !customer) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-2xl font-serif text-ink">{error || 'Customer not found'}</h2>
        <Link to="/tickets" className="inline-flex items-center text-navy hover:underline">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to queue
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-5xl mx-auto pb-20"
    >
      <Link
        to="/tickets"
        className="inline-flex items-center text-sm font-mono font-bold uppercase tracking-wider text-ink hover:underline transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to queue
      </Link>

      <div className="bg-surface border-2 border-ink rounded-lg shadow-[8px_8px_0px_0px_rgba(23,32,43,1)] p-8">
        <div className="flex items-center gap-4 mb-4">
          <span className="font-mono text-xs font-bold text-ink bg-line/30 px-3 py-1 rounded-md border-2 border-ink">
            CUST-{customer.id}
          </span>
          <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-[0.2em]">
            Customer Profile
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-sans font-black text-ink mb-8">{customer.name}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm font-sans font-medium text-ink">
          <div>
            <span className="font-mono text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">
              Email address
            </span>
            <span className="break-all">{customer.email || 'N/A'}</span>
          </div>
          <div>
            <span className="font-mono text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">
              Customer since
            </span>
            {formatDate(customer.createdAt).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="pt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-sans font-black text-ink uppercase tracking-wide">
            Related Tickets ({tickets.length})
          </h2>
          <Link
            to={`/tickets/new?customerId=${customer.id}`}
            className="inline-flex items-center px-4 py-2 bg-ink text-white text-xs font-mono font-bold uppercase tracking-wider rounded-full hover:bg-ink/90 transition-colors"
          >
            + New Ticket
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="border-2 border-ink border-dashed rounded-lg p-12 text-center text-ink-muted text-sm font-mono font-bold uppercase tracking-wider">
            This customer has no associated tickets.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-surface border-2 border-ink rounded-lg p-5 flex flex-col gap-4 hover:shadow-[4px_4px_0px_0px_rgba(23,32,43,1)] transition-shadow cursor-pointer"
                onClick={() => (window.location.href = `/tickets/${ticket.id}`)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-ink bg-line/30 px-2 py-1 rounded">
                    #{ticket.id}
                  </span>
                  <PriorityBadge priority={ticket.priority} />
                </div>

                <div>
                  <h3 className="font-sans font-bold text-ink text-lg leading-tight line-clamp-2 mb-1">
                    {ticket.title}
                  </h3>
                </div>

                <div className="mt-auto pt-4 flex items-center justify-between border-t-2 border-ink">
                  <StatusBadge status={ticket.status} />
                  <div className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center text-ink hover:bg-ink hover:text-white transition-colors">
                    <span className="text-lg leading-none">&rarr;</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
