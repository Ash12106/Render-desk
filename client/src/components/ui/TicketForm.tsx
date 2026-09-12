import React, { useState, useEffect } from 'react';
import { Customer, Ticket } from '@/src/types';
import { cn } from '@/src/lib/utils';
import {
  AlignLeft,
  ChevronDown,
  ClipboardList,
  FileText,
  Info,
  Lightbulb,
  Mail,
  Phone,
  UserRound,
  Paperclip,
  X,
} from 'lucide-react';

interface TicketFormProps {
  customers: Customer[];
  initialData?: Partial<Ticket>;
  onSubmit: (data: Partial<Ticket>) => Promise<void>;
  onCancel: () => void;
  serverErrors?: Record<string, string>;
  isEdit?: boolean;
  customerMode?: boolean;
}

const scenarioPresets = [
  {
    label: 'Cannot sign in',
    title: 'Customer cannot sign in',
    description:
      'Customer is blocked from signing in. Capture the error message, affected account, and last time access worked.',
    category: 'Account' as const,
    priority: 'High' as const,
  },
  {
    label: 'Payment issue',
    title: 'Payment or invoice issue',
    description:
      'Customer reports a payment, invoice, or charge concern. Capture the transaction date, amount, and expected outcome.',
    category: 'Billing' as const,
    priority: 'Medium' as const,
  },
  {
    label: 'Product not working',
    title: 'Product feature is not working',
    description:
      'Describe what the customer expected, what happened instead, and the steps needed to reproduce the issue.',
    category: 'Technical' as const,
    priority: 'Medium' as const,
  },
];

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
            assignmentType: 'Incident',
            impact: 'No Impact',
            attachments: [],
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
      assignmentType: 'Incident',
      impact: 'No Impact',
      attachments: [],
      ...initialData,
    };
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Merge client and server errors
  const errors = { ...clientErrors, ...serverErrors };

  const validate = (data: Partial<Ticket>) => {
    const errs: Record<string, string> = {};
    if (!data.customerId) errs.customerId = 'Choose a customer.';
    if (!data.title?.trim()) errs.title = 'Enter a ticket title.';
    if (!data.description?.trim()) errs.description = 'Describe the reported issue.';
    if (!data.priority || !['Low', 'Medium', 'High', 'Critical'].includes(data.priority))
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

  const applyScenario = (scenario: (typeof scenarioPresets)[number]) => {
    setFormData((prev) => ({
      ...prev,
      title: scenario.title,
      description: scenario.description,
      category: scenario.category,
      priority: scenario.priority,
    }));
  };

  const handleAttachments = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, 5);
    const oversized = selected.find((file) => file.size > 5_000_000);
    if (oversized) {
      setAttachmentError(`${oversized.name} is larger than 5 MB.`);
      return;
    }
    setAttachmentError(null);
    const attachments = await Promise.all(
      selected.map(async (file) => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
      })),
    );
    setFormData((prev) => ({ ...prev, attachments }));
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

    const payload: Partial<Ticket> = {
      ...formData,
      priority: ['Low', 'Medium', 'High', 'Critical'].includes(formData.priority || '') ? formData.priority : 'Medium',
      status: ['Open', 'In Progress', 'Resolved', 'Closed'].includes(formData.status || '') ? formData.status : 'Open',
      category: formData.category || 'Technical',
      assignmentType: formData.assignmentType || 'Incident',
      impact: formData.impact || 'No Impact',
      tags: (formData.tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 12),
      attachments: (formData.attachments || []).filter((attachment) => attachment.size > 0).slice(0, 5),
    };
    const errs = validate(payload);
    setClientErrors(errs);

    if (Object.keys(errs).length > 0) {
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(payload);
      if (!isEdit) {
        localStorage.removeItem('ticket_draft_new');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {!isEdit && (
        <section className="bg-surface-muted/50 border border-line rounded-md p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Start from a common request</h2>
              <p className="text-sm text-ink-muted mt-1">
                Use a scenario to prefill a useful first draft, then add the customer-specific details.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {scenarioPresets.map((scenario) => (
              <button
                key={scenario.label}
                type="button"
                onClick={() => applyScenario(scenario)}
                className="border border-ink bg-surface rounded-full px-3 py-2 text-xs font-mono font-bold hover:bg-ink hover:text-white transition-colors"
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* SECTION: CUSTOMER RELATIONSHIP */}
      {!customerMode && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <UserRound className="w-5 h-5" />
            <div>
              <h2 className="font-mono text-xs sm:text-sm font-bold text-ink uppercase tracking-wider">Customer</h2>
              <p className="text-sm text-ink-muted mt-1">Who is affected by this request?</p>
            </div>
          </div>
          <div>
            <div className="w-full relative">
              <select
                id="customerId"
                value={formData.customerId || ''}
                onChange={(e) => handleChange('customerId', e.target.value)}
                onBlur={() => handleBlur('customerId')}
                className={cn(
                  'w-full appearance-none bg-surface border-2 rounded-md px-4 py-3 text-sm font-medium focus:outline-none transition-colors cursor-pointer text-ink',
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
              <p id="customerId-error" className="font-mono text-xs text-danger mt-2">
                {errors.customerId}
              </p>
            ) : null}
            {formData.customerId &&
              (() => {
                const customer = customers.find((item) => item.id === formData.customerId);
                return customer ? (
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-ink-muted">
                    {customer.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        {customer.email}
                      </span>
                    )}
                    {customer.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {customer.phone}
                      </span>
                    )}
                  </div>
                ) : null;
              })()}
          </div>
        </section>
      )}

      {customerMode && <input type="hidden" name="customerId" value={formData.customerId || ''} />}

      <hr className="border-t border-ink" />

      {/* SECTION: ISSUE DETAILS */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <ClipboardList className="w-5 h-5" />
          <div>
            <h2 className="font-mono text-xs sm:text-sm font-bold text-ink uppercase tracking-wider">
              What needs attention?
            </h2>
            <p className="text-sm text-ink-muted mt-1">
              Write it so another teammate can take over without calling back.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="relative">
              <FileText className="absolute left-4 top-3 w-5 h-5 text-ink-muted" />
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
                placeholder="Example: Customer cannot access the billing portal"
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
              <AlignLeft className="absolute left-4 top-3 w-5 h-5 text-ink-muted" />
              <textarea
                id="description"
                rows={5}
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
                placeholder="Include what happened, when it started, any error message, and what has already been tried."
              />
            </div>
            {errors.description && (
              <p id="description-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.description}
              </p>
            )}
          </div>
          <p className="font-mono text-xs text-ink-muted mt-3">
            Avoid sensitive data such as passwords or full payment card numbers.
          </p>
        </div>
      </section>

      <hr className="border-t border-ink" />

      {/* SECTION: CLASSIFICATION */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <Info className="w-5 h-5" />
          <div>
            <h2 className="font-mono text-xs sm:text-sm font-bold text-ink uppercase tracking-wider">
              Triage and follow-up
            </h2>
            <p className="text-sm text-ink-muted mt-1">Set the urgency and next action for the support team.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="relative">
            <label htmlFor="category" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Category
            </label>
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
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
          </div>

          <div className="relative">
            <label htmlFor="priority" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Priority
            </label>
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
              <option value="Critical">Critical</option>
            </select>
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
            {errors.priority && (
              <p id="priority-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.priority}
              </p>
            )}
          </div>

          <div className="relative">
            <label htmlFor="status" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Status
            </label>
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
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
            {errors.status && (
              <p id="status-error" className="font-mono text-xs text-danger mt-2 ml-1">
                {errors.status}
              </p>
            )}
          </div>

          <div className="relative">
            <label
              htmlFor="assignmentType"
              className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted"
            >
              Request type
            </label>
            <select
              id="assignmentType"
              value={formData.assignmentType || 'Incident'}
              onChange={(e) => handleChange('assignmentType', e.target.value)}
              className="w-full appearance-none bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 cursor-pointer text-ink"
            >
              <option value="Incident">Incident</option>
              <option value="Problem">Problem</option>
              <option value="Request">Request</option>
              <option value="Change">Change</option>
            </select>
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
          </div>

          <div className="relative">
            <label htmlFor="contract" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Contract
            </label>
            <select
              id="contract"
              value={formData.contract || ''}
              onChange={(e) => handleChange('contract', e.target.value)}
              className="w-full appearance-none bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 cursor-pointer text-ink"
            >
              <option value="">Select contract</option>
              <option value="Standard Support">Standard Support</option>
              <option value="Premium Support">Premium Support</option>
              <option value="Enterprise SLA">Enterprise SLA</option>
            </select>
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
          </div>

          <div className="relative">
            <label
              htmlFor="ticketForm"
              className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted"
            >
              Ticket form
            </label>
            <select
              id="ticketForm"
              value={formData.ticketForm || ''}
              onChange={(e) => handleChange('ticketForm', e.target.value)}
              className="w-full appearance-none bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 cursor-pointer text-ink"
            >
              <option value="">Select ticket form</option>
              <option value="Access Request">Access Request</option>
              <option value="Incident Report">Incident Report</option>
              <option value="Service Request">Service Request</option>
            </select>
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
          </div>

          <div className="relative">
            <label htmlFor="impact" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Impact
            </label>
            <select
              id="impact"
              value={formData.impact || 'No Impact'}
              onChange={(e) => handleChange('impact', e.target.value)}
              className="w-full appearance-none bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 cursor-pointer text-ink"
            >
              {['No Impact', 'Site Down', 'Server Issue', 'Minor', 'Major', 'Crisis'].map((impact) => (
                <option key={impact}>{impact}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-[2.1rem] w-5 h-5 text-ink pointer-events-none" />
          </div>

          <div className="relative">
            <label
              htmlFor="productFamily"
              className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted"
            >
              Product family
            </label>
            <input
              id="productFamily"
              value={formData.productFamily || ''}
              onChange={(e) => handleChange('productFamily', e.target.value)}
              placeholder="Product family"
              className="w-full bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 text-ink"
            />
          </div>

          <div className="relative sm:col-span-2">
            <label htmlFor="tags" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Tags <span className="font-sans normal-case font-normal">(optional)</span>
            </label>
            <input
              id="tags"
              value={(formData.tags || []).join(', ')}
              onChange={(event) =>
                handleChange(
                  'tags',
                  event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean),
                )
              }
              placeholder="Example: login, urgent, mobile"
              maxLength={491}
              className="w-full bg-surface border-2 border-ink rounded-md px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ink/20 text-ink"
              aria-describedby="tags-help"
            />
            <p id="tags-help" className="mt-1 text-xs text-ink-muted">Separate up to 12 short labels with commas.</p>
          </div>

          <div className="sm:col-span-2 md:col-span-3 border-2 border-dashed border-ink rounded-md p-4 bg-surface-muted/20">
            <label
              htmlFor="attachments"
              className="flex items-center gap-2 font-mono text-xs font-bold uppercase cursor-pointer hover:text-navy"
            >
              <Paperclip className="w-4 h-4" /> Add screenshots or files
            </label>
            <p className="text-sm text-ink mt-2">Attach a PNG, photo, PDF, or log if it helps explain the issue.</p>
            <input
              id="attachments"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.doc,.docx"
              onChange={(e) => void handleAttachments(e.target.files)}
              className="sr-only"
            />
            <p className="text-xs text-ink-muted mt-1">
              Up to 5 files, 5 MB each. Avoid passwords and payment details.
            </p>
            {attachmentError && <p className="font-mono text-xs text-danger mt-2">{attachmentError}</p>}
            {!!formData.attachments?.length && (
              <div className="flex flex-wrap gap-2 mt-3">
                {formData.attachments.map((attachment) => (
                  <span
                    key={attachment.name}
                    className="inline-flex items-center gap-2 bg-surface border border-line rounded px-2 py-1 text-xs"
                  >
                    {attachment.name}
                    <button
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      onClick={() =>
                        handleChange(
                          'attachments',
                          formData.attachments?.filter((item) => item.name !== attachment.name),
                        )
                      }
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label htmlFor="dueDate" className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-ink-muted">
              Follow-up date <span className="font-sans normal-case font-normal">(optional)</span>
            </label>
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
