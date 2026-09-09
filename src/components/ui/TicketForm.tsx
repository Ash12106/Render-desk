import React, { useState, useEffect } from 'react';
import { Customer, Ticket } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Search, ChevronDown, Info } from 'lucide-react';

interface TicketFormProps {
  customers: Customer[];
  initialData?: Partial<Ticket>;
  onSubmit: (data: Partial<Ticket>) => Promise<void>;
  onCancel: () => void;
  serverErrors?: Record<string, string>;
  isEdit?: boolean;
  customerMode?: boolean;
}

export function TicketForm({
  customers,
  initialData,
  onSubmit,
  onCancel,
  serverErrors = {},
  isEdit = false,
  customerMode = false,
}: TicketFormProps) {
  const [formData, setFormData] = useState<Partial<Ticket>>(() => {
    if (!isEdit) {
      try {
        const draft = localStorage.getItem('ticket_draft_new');
        if (draft) {
          const parsed = JSON.parse(draft);
          return {
            customerId: undefined,
            title: '',
            description: '',
            priority: 'Medium',
            status: 'Open',
            category: 'Technical',
            ...initialData,
            ...parsed, // draft overrides initialData
          };
        }
      } catch (e) {
        console.error('Failed to parse draft', e);
      }
    }
    return {
      customerId: undefined,
      title: '',
      description: '',
      priority: 'Medium',
      status: 'Open',
      category: 'Technical',
      ...initialData,
    };
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Merge client and server errors
  const errors = { ...clientErrors, ...serverErrors };

  const validate = (data: Partial<Ticket>) => {
    const errs: Record<string, string> = {};
    if (!data.customerId) errs.customerId = 'Choose a customer.';
    if (!data.title?.trim()) errs.title = 'Enter a ticket title.';
    if (!data.description?.trim()) errs.description = 'Describe the reported issue.';
    if (!data.priority || !['Low', 'Medium', 'High'].includes(data.priority))
      errs.priority = 'Choose a valid priority.';
    if (!data.status || !['Open', 'In Progress', 'Resolved', 'Closed'].includes(data.status))
      errs.status = 'Choose a valid status.';
    return errs;
  };

  useEffect(() => {
    if (!isEdit) {
      localStorage.setItem('ticket_draft_new', JSON.stringify(formData));
    }
  }, [formData, isEdit]);

  useEffect(() => {
    if (hasSubmitted) {
      setClientErrors(validate(formData));
    }
  }, [formData, hasSubmitted]);

  const handleChange = (field: keyof Ticket, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof Ticket) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (hasSubmitted || touched[field]) {
      setClientErrors(validate(formData));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);

    const errs = validate(formData);
    setClientErrors(errs);

    if (Object.keys(errs).length > 0) {
      return; // Stop if client validation fails
    }

    setIsSaving(true);
    try {
      await onSubmit(formData);
      if (!isEdit) {
        localStorage.removeItem('ticket_draft_new');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-12">
      {/* SECTION: CUSTOMER RELATIONSHIP */}
      {!customerMode && (
        <section>
          <h2 className="font-mono text-xs sm:text-sm font-bold text-ink uppercase tracking-wider mb-6">
            Customer Relationship
          </h2>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-sm relative">
              <select
                id="customerId"
                value={formData.customerId || ''}
                onChange={(e) => handleChange('customerId', e.target.value)}
                onBlur={() => handleBlur('customerId')}
                className={cn(
                  'w-full appearance-none bg-surface border-2 rounded-md px-4 py-3 text-sm font-medium focus:outline-none transition-colors cursor-pointer text-ink text-center',
                  errors.customerId
                    ? 'border-danger focus:border-danger text-danger'
                    : 'border-ink focus:ring-2 focus:ring-ink/20',
                )}
                aria-describedby={errors.customerId ? 'customerId-error' : undefined}
                aria-invalid={!!errors.customerId}
              >
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-ink pointer-events-none" />
            </div>
            {errors.customerId ? (
              <p id="customerId-error" className="text-center font-mono text-xs text-danger mt-3">
                {errors.customerId}
              </p>
            ) : (
              <p className="text-center font-mono text-xs text-ink-muted mt-3">
                Choose the customer reporting the issue.
              </p>
            )}
          </div>
        </section>
      )}

      {customerMode && <input type="hidden" name="customerId" value={formData.customerId || ''} />}

      <hr className="border-t border-ink" />

      {/* SECTION: ISSUE DETAILS */}
      <section>
        <h2 className="font-mono text-xs sm:text-sm font-bold text-ink uppercase tracking-wider mb-6">Issue Details</h2>
        <div className="space-y-4">
          <div>
            <div className="relative">
              <Search className="absolute left-4 top-3 w-5 h-5 text-ink-muted" />
              <input
                id="title"
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                onBlur={() => handleBlur('title')}
                className={cn(
                  'w-full bg-surface border-2 rounded-md pl-11 pr-4 py-2.5 text-sm font-medium focus:outline-none transition-colors text-ink',
                  errors.title ? 'border-danger focus:border-danger' : 'border-ink focus:ring-2 focus:ring-ink/20',
                )}
                aria-describedby={errors.title ? 'title-error' : undefined}
                aria-invalid={!!errors.title}
                placeholder="Brief summary of the issue"
              />
            </div>
            {errors.title && (
              <p id="title-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <div className="relative">
              <Search className="absolute left-4 top-3 w-5 h-5 text-ink-muted" />
              <textarea
                id="description"
                rows={3}
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                className={cn(
                  'w-full bg-surface border-2 rounded-md pl-11 pr-4 py-2.5 text-sm font-medium focus:outline-none transition-colors resize-y text-ink',
                  errors.description
                    ? 'border-danger focus:border-danger'
                    : 'border-ink focus:ring-2 focus:ring-ink/20',
                )}
                aria-describedby={errors.description ? 'description-error' : undefined}
                aria-invalid={!!errors.description}
                placeholder="Detailed explanation of the problem..."
              />
            </div>
            {errors.description && (
              <p id="description-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.description}
              </p>
            )}
          </div>
          <p className="text-center font-mono text-xs text-ink-muted mt-3">Describe the reported issue in detail.</p>
        </div>
      </section>

      <hr className="border-t border-ink" />

      {/* SECTION: CLASSIFICATION */}
      <section>
        <h2 className="font-mono text-xs sm:text-sm font-bold text-ink uppercase tracking-wider mb-6">
          Classification & Timeline
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="relative">
            <select
              id="category"
              value={formData.category || 'Technical'}
              onChange={(e) => handleChange('category', e.target.value)}
              className="w-full appearance-none bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 cursor-pointer text-ink"
              aria-label="Problem category"
            >
              <option value="Technical">Technical support</option>
              <option value="Sales">Sales and plans</option>
              <option value="Billing">Billing and payments</option>
              <option value="Account">Account access</option>
              <option value="Other">Something else</option>
            </select>
            <ChevronDown className="absolute right-4 top-3 w-5 h-5 text-ink pointer-events-none" />
          </div>

          <div className="relative">
            <select
              id="priority"
              value={formData.priority || 'Medium'}
              onChange={(e) => handleChange('priority', e.target.value)}
              onBlur={() => handleBlur('priority')}
              className={cn(
                'w-full appearance-none bg-surface border-2 rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none transition-colors cursor-pointer text-ink',
                errors.priority ? 'border-danger focus:border-danger' : 'border-ink focus:ring-2 focus:ring-ink/20',
              )}
              aria-describedby={errors.priority ? 'priority-error' : undefined}
              aria-invalid={!!errors.priority}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <ChevronDown className="absolute right-4 top-3 w-5 h-5 text-ink pointer-events-none" />
            {errors.priority && (
              <p id="priority-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.priority}
              </p>
            )}
          </div>

          <div className="relative">
            <select
              id="status"
              value={formData.status || 'Open'}
              onChange={(e) => handleChange('status', e.target.value)}
              onBlur={() => handleBlur('status')}
              className={cn(
                'w-full appearance-none bg-surface border-2 rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none transition-colors cursor-pointer text-ink',
                errors.status ? 'border-danger focus:border-danger' : 'border-ink focus:ring-2 focus:ring-ink/20',
              )}
              aria-describedby={errors.status ? 'status-error' : undefined}
              aria-invalid={!!errors.status}
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
            <ChevronDown className="absolute right-4 top-3 w-5 h-5 text-ink pointer-events-none" />
            {errors.status && (
              <p id="status-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.status}
              </p>
            )}
          </div>

          <div className="relative">
            <input
              id="dueDate"
              type="date"
              value={formData.dueDate ? new Date(formData.dueDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleChange('dueDate', e.target.value || undefined)}
              onBlur={() => handleBlur('dueDate')}
              className={cn(
                'w-full bg-surface border-2 rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none transition-colors text-ink',
                errors.dueDate ? 'border-danger focus:border-danger' : 'border-ink focus:ring-2 focus:ring-ink/20',
              )}
              aria-describedby={errors.dueDate ? 'dueDate-error' : undefined}
            />
            {errors.dueDate && (
              <p id="dueDate-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.dueDate}
              </p>
            )}
          </div>
        </div>
      </section>

      <hr className="border-t border-ink" />

      {/* FOOTER */}
      <div className="flex flex-col items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="bg-ink text-white font-mono text-sm font-bold px-10 py-3 rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50 tracking-wider"
        >
          {isSaving ? 'Processing...' : isEdit ? 'Save Changes' : 'Create Ticket'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="font-mono text-sm text-ink hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {!isEdit && (
        <div className="mt-8 bg-surface border border-ink rounded-md p-4 flex items-center justify-center gap-3">
          <Info className="w-5 h-5 text-ink" />
          <p className="font-mono text-[11px] sm:text-xs text-ink">
            The ticket will be assigned a unique ID and timestamps upon creation.
          </p>
        </div>
      )}
    </form>
  );
}
