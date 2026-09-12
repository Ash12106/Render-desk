import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '@/src/api';
import { formatDate } from '@/src/lib/utils';

export function CustomerSatisfactionReport() {
  const report = useQuery({ queryKey: ['customer-satisfaction-report'], queryFn: api.getCustomerSatisfactionReport });
  if (report.isPending) return <div className="m-8 h-64 animate-pulse rounded-md border border-line bg-surface" />;
  if (report.error || !report.data)
    return (
      <p role="alert" className="p-8 text-center text-danger">
        Unable to load customer satisfaction reporting.
      </p>
    );
  const data = report.data;
  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 pb-16">
      <header>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">Administrator reporting</p>
        <h1 className="mt-2 text-4xl font-sans font-black">Customer satisfaction</h1>
        <p className="mt-2 text-ink-muted">
          Resolution feedback from customers, shown without changing ticket records.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['Responses', data.responses],
          ['Average rating', `${data.averageScore} / 5`],
          ['Five-star ratings', data.fiveStar],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-md border-2 border-ink bg-surface p-5">
            <p className="font-mono text-xs font-bold uppercase text-ink-muted">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-md border-2 border-ink bg-surface p-5">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Recent feedback</h2>
        {data.recent.length ? (
          <ul className="mt-4 space-y-3">
            {data.recent.map((entry) => (
              <li key={entry.id} className="rounded border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{entry.customerId?.name || 'Customer'}</span>
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-warning text-warning" />
                    {entry.score}/5
                  </span>
                  <span className="text-xs text-ink-muted">{formatDate(entry.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {entry.ticketId?.title || 'Ticket'}
                  {entry.comment ? ` — ${entry.comment}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded border-2 border-dashed border-ink p-8 text-center text-ink-muted">
            No feedback has been submitted yet.
          </p>
        )}
      </section>
    </div>
  );
}
