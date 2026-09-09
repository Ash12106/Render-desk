import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '@/src/api';
import { Ticket, Customer } from '@/src/types';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '@/src/components/ui/Toast';
import { TicketForm } from '@/src/components/ui/TicketForm';

export function TicketFormRoute() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = new URLSearchParams(window.location.search);
  const prefillCustomerId = location.get('customerId');
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [initialData, setInitialData] = useState<Partial<Ticket>>({
    customerId: prefillCustomerId || undefined,
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Open',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const custs = await api.getCustomers();
        setCustomers(custs);

        if (isEdit && id) {
          const { ticket: tkt } = await api.getTicket(id);
          setInitialData({
            customerId: tkt.customerId,
            title: tkt.title,
            description: tkt.description,
            priority: tkt.priority,
            status: tkt.status,
            category: tkt.category,
            assignmentType: tkt.assignmentType,
            contract: tkt.contract,
            ticketForm: tkt.ticketForm,
            impact: tkt.impact,
            productFamily: tkt.productFamily,
            attachments: tkt.attachments || [],
            dueDate: tkt.dueDate,
          });
        }
      } catch (err: any) {
        setGlobalError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const handleSubmit = async (formData: Partial<Ticket>) => {
    setFieldErrors({});
    setGlobalError(null);

    try {
      if (isEdit && id) {
        await api.updateTicket(id, formData);
        showToast('Ticket updated successfully');
        navigate(`/tickets/${id}`);
      } else {
        await api.createTicket(formData);
        showToast('Ticket created successfully');
        navigate('/tickets');
      }
    } catch (err: any) {
      if (err.code === 'VALIDATION_ERROR' && err.fields) {
        setFieldErrors(err.fields);
        throw new Error('Please correct the highlighted fields.', { cause: err });
      } else {
        setGlobalError(err.message || 'An unexpected error occurred');
        throw err;
      }
    }
  };

  const handleCancel = () => {
    if (isEdit && id) {
      navigate(`/tickets/${id}`);
    } else {
      navigate('/tickets');
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8"></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <Link
          to={isEdit ? `/tickets/${id}` : '/tickets'}
          className="inline-flex items-center text-xs font-mono text-ink-muted hover:text-ink transition-colors uppercase tracking-wider font-semibold"
        >
          <ArrowLeft className="w-3 h-3 mr-2" />
          Back
        </Link>
      </div>

      <div className="text-center space-y-4 mb-16 mt-4">
        <p className="font-mono text-[10px] sm:text-xs text-ink-muted uppercase tracking-[0.2em] font-bold">
          Support Operations
        </p>
        <h1 className="text-4xl sm:text-5xl font-serif text-ink tracking-tight font-medium">
          {isEdit ? 'Edit Ticket' : 'New Ticket'}
        </h1>
        <p className="text-sm text-ink-muted">
          {isEdit ? 'Update the details of the service request.' : 'Create a new service request for a customer.'}
        </p>
      </div>

      <div className="border-t-[1.5px] border-ink pt-12">
        {globalError && (
          <div className="mb-8 p-4 bg-danger-bg text-danger text-sm rounded-md border border-danger/20 text-center font-medium">
            {globalError}
          </div>
        )}

        <TicketForm
          customers={customers}
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          serverErrors={fieldErrors}
          isEdit={isEdit}
        />
      </div>
    </motion.div>
  );
}
