import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/src/api';
import { StatusBadge, PriorityBadge } from '@/src/components/ui/Badge';
import { formatDate } from '@/src/lib/utils';
import { Comment } from '@/src/types';

export function CustomerTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const tickets = useQuery({
    queryKey: ['customer-tickets'],
    queryFn: api.getCustomerTickets,
    refetchInterval: 15000,
  });
  const comments = useQuery({
    queryKey: ['customer-ticket-comments', id],
    queryFn: () => api.getCustomerComments(id!),
    enabled: !!id,
    refetchInterval: 1500,
  });
  const commentMutation = useMutation({
    mutationFn: (content: string) => api.createCustomerComment(id!, content),
    onSuccess: (comment) => {
      queryClient.setQueryData<Comment[]>(['customer-ticket-comments', id], (current = []) => [...current, comment]);
      queryClient.invalidateQueries({ queryKey: ['customer-tickets'] });
      setNewComment('');
    },
  });
  if (tickets.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (tickets.isError)
    return (
      <p role="alert" className="p-8 text-danger">
        Unable to load your ticket. {tickets.error.message}
      </p>
    );
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
      <section className="bg-surface border-2 border-ink rounded-md p-6 md:p-8">
        <div className="mb-5">
          <h2 className="text-xl font-sans font-black text-ink">Activity Log</h2>
          <p className="text-sm text-ink-muted mt-1">Follow the conversation and reply to the support team.</p>
        </div>
        {comments.isPending ? (
          <div className="animate-pulse h-24 bg-canvas rounded-md" />
        ) : comments.isError ? (
          <p className="text-sm text-danger">Unable to load the conversation.</p>
        ) : comments.data?.length ? (
          <div className="space-y-4 mb-6">
            {comments.data.map((comment) => (
              <article key={comment.id} className="p-4 rounded-md border-2 border-ink bg-canvas">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-sans font-bold text-ink text-sm flex items-center gap-2">
                    {comment.author}
                    <span className="font-mono text-[10px] bg-line/20 px-2 py-0.5 rounded-full text-ink-muted uppercase">
                      Message
                    </span>
                  </span>
                  <time className="text-xs text-ink-muted font-mono">{formatDate(comment.createdAt)}</time>
                </div>
                <p className="text-sm text-ink whitespace-pre-wrap">{comment.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted mb-6">No messages yet.</p>
        )}
        {ticket.status === 'Closed' ? (
          <p className="text-sm text-ink-muted border border-line rounded-md bg-canvas p-4">
            This ticket is closed. The conversation is read-only.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const content = newComment.trim();
              if (content && !commentMutation.isPending) commentMutation.mutate(content);
            }}
          >
            <label htmlFor="customer-comment" className="block text-xs font-mono font-bold uppercase text-ink">
              Your message
            </label>
            <textarea
              id="customer-comment"
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              rows={4}
              placeholder="Share an update or reply to the support team..."
              className="w-full bg-canvas border-2 border-ink rounded-md p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
            {commentMutation.isError && (
              <p className="text-sm text-danger">
                {commentMutation.error instanceof Error
                  ? commentMutation.error.message
                  : 'Unable to send your message.'}
              </p>
            )}
            <button
              type="submit"
              disabled={!newComment.trim() || commentMutation.isPending}
              className="px-4 py-2 bg-ink text-white rounded-md font-mono text-xs font-bold uppercase disabled:opacity-50"
            >
              {commentMutation.isPending ? 'Sending...' : 'Send message'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
