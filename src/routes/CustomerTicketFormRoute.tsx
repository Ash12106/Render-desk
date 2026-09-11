import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/api';
import { TicketForm } from '@/src/components/ui/TicketForm';
import { Ticket } from '@/src/types';

export function CustomerTicketFormRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['customer-profile'], queryFn: api.getCustomerProfile });

  if (profile.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (!profile.data)
    return <div className="p-8 text-center text-danger">Your customer profile could not be loaded.</div>;

  const customer = profile.data;
  const initialData: Partial<Ticket> = {
    customerId: customer.id,
    priority: 'Medium',
    status: 'Open',
    category: 'Technical',
  };
  return (
    <div className="max-w-4xl mx-auto px-4 pb-12">
      <div className="text-center space-y-3 mb-12">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">Customer support</p>
        <h1 className="text-4xl font-serif text-ink">Raise a new ticket</h1>
        <p className="text-sm text-ink-muted max-w-xl mx-auto">
          Tell us what happened, when it started, and what you expected to happen. Screenshots are welcome.
        </p>
      </div>
      <TicketForm
        customers={[customer]}
        initialData={initialData}
        customerMode
        onSubmit={async (formData) => {
          await api.createCustomerTicket(formData);
          await queryClient.invalidateQueries({ queryKey: ['customer-tickets'] });
          navigate('/customer');
        }}
        onCancel={() => navigate('/customer')}
      />
    </div>
  );
}
