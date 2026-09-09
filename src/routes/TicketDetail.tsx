import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '@/src/api';
import { Ticket, Comment, AuditLog } from '@/src/types';
import { StatusBadge, PriorityBadge } from '@/src/components/ui/Badge';
import { formatDate, getSlaStatus } from '@/src/lib/utils';
import { motion } from 'motion/react';
import { ArrowLeft, Trash2, Edit, AlertCircle, Clock } from 'lucide-react';
import { useToast } from '@/src/components/ui/Toast';
import { ConfirmModal } from '@/src/components/ui/ConfirmModal';
import { useQueryClient } from '@tanstack/react-query';

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [activities, setActivities] = useState<(Comment | AuditLog)[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notifyUser, setNotifyUser] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const currentUser = JSON.parse(localStorage.getItem('auth_user') || 'null');
  const [activityStatusSaving, setActivityStatusSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setLoading(true);
        const { ticket: fetchedTicket, comments: fetchedComments, logs: fetchedLogs } = await api.getTicket(id);
        setTicket(fetchedTicket);

        const combined = [
          ...fetchedComments,
          ...(fetchedLogs || []).filter((log) => log.action !== 'COMMENT_ADDED'),
        ].sort((a, b) => {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        setActivities(combined);
      } catch (err: any) {
        setError(err.message || 'Ticket not found');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.deleteTicket(id);
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
      showToast('Ticket deleted successfully');
      navigate('/tickets');
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete ticket');
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: Ticket['status']) => {
    if (!ticket || ticket.status === newStatus || !id) return;
    const oldTicket = { ...ticket };
    setTicket({ ...ticket, status: newStatus });

    try {
      const updated = await api.updateTicket(id, { ...ticket, status: newStatus, notifyUser });
      setTicket(updated);
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });

      const authUserStr = localStorage.getItem('auth_user');
      const author = authUserStr ? JSON.parse(authUserStr).username : 'Current User';
      const newLog: AuditLog = {
        id: `temp-status-${Date.now()}`,
        ticketId: id,
        action: 'STATUS_CHANGE',
        details: `Status changed from ${oldTicket.status} to ${newStatus}`,
        author,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setActivities((prev) =>
        [...prev, newLog].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      );

      showToast(`Status changed to ${newStatus}`);
      if (notifyUser) showToast('Customer notification simulated');
    } catch (_err: any) {
      setTicket(oldTicket);
      showToast('Failed to update status');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newComment.trim()) return;

    const authUserStr = localStorage.getItem('auth_user');
    const author = authUserStr ? JSON.parse(authUserStr).username : 'Current User';

    const tempId = `temp-${Date.now()}`;
    const optimisticComment: Comment = {
      id: tempId,
      ticketId: id,
      content: newComment,
      author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setActivities((prev) => [...prev, optimisticComment]);
    const commentContent = newComment;
    setNewComment('');

    try {
      setIsSubmittingComment(true);
      const comment = await api.createComment(id, { content: commentContent, author });

      setActivities((prev) => {
        const withoutTemp = prev.filter((c) => c.id !== tempId);
        return [...withoutTemp, comment].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
      showToast('Comment added');
    } catch (_err: any) {
      setActivities((prev) => prev.filter((c) => c.id !== tempId));
      setNewComment(commentContent);
      showToast('Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleActivityStatusChange = async (activityStatus: NonNullable<Ticket['activityStatus']>) => {
    if (!id || !ticket || activityStatus === ticket.activityStatus) return;
    const previousTicket = ticket;
    setTicket({ ...ticket, activityStatus });
    setActivityStatusSaving(true);
    try {
      const updated = await api.updateActivityStatus(id, activityStatus);
      setTicket(updated);
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast(`Activity status updated to ${activityStatus}`);
    } catch (error: any) {
      setTicket(previousTicket);
      showToast(error.message || 'Failed to update activity status', 'error');
    } finally {
      setActivityStatusSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8"></div>;
  }

  if (error || !ticket) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-2xl font-serif text-ink">{error || 'Ticket not found'}</h2>
        <Link to="/tickets" className="inline-flex items-center text-navy hover:underline">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to queue
        </Link>
      </div>
    );
  }

  const statusFlow: Ticket['status'][] = ['Open', 'In Progress', 'Resolved', 'Closed'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6 pb-20"
    >
      <Link
        to="/tickets"
        className="inline-flex items-center text-sm font-mono font-bold uppercase tracking-wider text-ink hover:underline transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to queue
      </Link>

      <div className="bg-surface border-2 border-ink rounded-lg overflow-hidden shadow-[8px_8px_0px_0px_rgba(23,32,43,1)]">
        <div className="p-6 md:p-8 border-b-2 border-ink flex flex-col md:flex-row md:items-start justify-between gap-6 bg-canvas">
          <div className="space-y-4 flex-1">
            <div className="flex items-center flex-wrap gap-3">
              <span className="font-mono text-sm font-bold text-ink bg-line/30 px-3 py-1 rounded-md border-2 border-ink">
                #{ticket.id}
              </span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {(ticket.assignedGroup || ticket.assignedStaffName) && (
                <span className="font-mono text-xs font-bold uppercase border-2 border-ink rounded-md px-3 py-1">
                  {ticket.assignedGroup || 'Assigned'}
                  {ticket.assignedStaffName ? ` · ${ticket.assignedStaffName}` : ''}
                </span>
              )}
              {ticket.dueDate && ticket.status !== 'Resolved' && ticket.status !== 'Closed' && (
                <div
                  className={`flex items-center gap-1.5 font-mono text-xs font-bold px-3 py-1 rounded-md border-2 ${
                    getSlaStatus(ticket.dueDate) === 'overdue'
                      ? 'bg-danger-bg border-danger text-danger'
                      : getSlaStatus(ticket.dueDate) === 'warning'
                        ? 'bg-warning-bg border-warning text-warning'
                        : 'bg-canvas border-ink text-ink-muted'
                  }`}
                >
                  {getSlaStatus(ticket.dueDate) === 'overdue' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  Due {formatDate(ticket.dueDate)}
                </div>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-sans font-black text-ink leading-tight">{ticket.title}</h1>
            <div className="text-sm font-mono font-bold text-ink flex items-center flex-wrap gap-x-4 gap-y-2">
              <span>
                CUSTOMER:{' '}
                <Link to={`/customers/${ticket.customerId}`} className="underline hover:text-navy">
                  {ticket.customerName}
                </Link>
              </span>
              <span>•</span>
              <span>CREATED: {formatDate(ticket.createdAt).toUpperCase()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/tickets/${ticket.id}/edit`}
              className="inline-flex items-center px-4 py-2 bg-ink text-white text-xs font-mono font-bold uppercase tracking-wider rounded-full hover:bg-ink/90 transition-colors"
            >
              <Edit className="w-4 h-4 mr-1.5" /> Edit
            </Link>
            <button
              onClick={() => setDeleteDialog(true)}
              className="inline-flex items-center px-4 py-2 bg-danger text-white text-xs font-mono font-bold uppercase tracking-wider rounded-full hover:bg-danger/90 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="flex-1 space-y-10">
              <section>
                <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-[0.2em] mb-4">Description</h3>
                <div className="prose prose-sm max-w-none text-ink bg-canvas p-6 rounded-md border-2 border-ink whitespace-pre-wrap font-sans font-medium">
                  {ticket.description}
                </div>
              </section>

              {ticket.attachments && ticket.attachments.length > 0 && (
                <section>
                  <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-[0.2em] mb-4">Attachments</h3>
                  <div className="flex flex-wrap gap-3">
                    {ticket.attachments.map((attachment) => (
                      <a
                        key={`${attachment.name}-${attachment.size}`}
                        href={attachment.data}
                        download={attachment.name}
                        className="inline-flex items-center gap-2 border-2 border-ink rounded-md bg-canvas px-3 py-2 text-xs font-mono font-bold hover:bg-ink hover:text-white transition-colors"
                      >
                        {attachment.name}
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-[0.2em] mb-4">
                  Activity status
                </h3>
                <select
                  aria-label="Activity status"
                  value={ticket.activityStatus || 'Unread'}
                  disabled={activityStatusSaving}
                  onChange={(event) =>
                    void handleActivityStatusChange(event.target.value as NonNullable<Ticket['activityStatus']>)
                  }
                  className="w-full max-w-md border-2 border-ink rounded-md bg-canvas px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-navy/30"
                >
                  <option>Unread</option>
                  <option>Read</option>
                  <option>Awaiting customer response</option>
                  <option>Awaiting technician response</option>
                </select>
                <p className="mt-2 text-xs text-ink-muted">
                  Use this for handoffs and response tracking; lifecycle status remains separate.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-[0.2em] mb-4">
                  Status Lifecycle
                </h3>
                {currentUser?.role === 'admin' ? (
                  <p className="mb-4 rounded-md border-2 border-warning bg-warning-bg p-3 font-mono text-xs font-bold uppercase tracking-wider text-warning">
                    Administrators manage assignments. Staff handle ticket progress and resolution.
                  </p>
                ) : (
                  <label className="mb-4 flex items-center justify-between gap-4 rounded-md border-2 border-ink bg-canvas p-3 font-mono text-xs font-bold uppercase tracking-wider text-ink">
                    <span>Notify customer on status change</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={notifyUser}
                      aria-label="Notify customer on status change"
                      checked={notifyUser}
                      onChange={(event) => setNotifyUser(event.target.checked)}
                      className="h-5 w-5 cursor-pointer accent-navy"
                    />
                  </label>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {statusFlow.map((s, i) => (
                    <React.Fragment key={s}>
                      <button
                        disabled={currentUser?.role === 'admin' || (ticket.status === 'Closed' && s !== 'Closed')}
                        onClick={() => handleStatusChange(s)}
                        className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-full border-2 transition-colors ${
                          ticket.status === s
                            ? 'bg-ink text-white border-ink'
                            : currentUser?.role === 'admin' || ticket.status === 'Closed'
                              ? 'bg-surface text-ink-muted border-line opacity-50 cursor-not-allowed'
                              : 'bg-surface text-ink border-ink hover:bg-line/20'
                        }`}
                      >
                        {s}
                      </button>
                      {i < statusFlow.length - 1 && <span className="text-ink font-bold">→</span>}
                    </React.Fragment>
                  ))}
                </div>
                {ticket.status === 'Closed' && (
                  <p className="mt-4 font-mono text-xs font-bold text-ink-muted uppercase">
                    This ticket is closed and cannot be changed.
                  </p>
                )}
              </section>

              <section>
                <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-[0.2em] mb-4">Activity Feed</h3>
                <div className="space-y-4">
                  {activities.map((activity) => {
                    const isLog = 'action' in activity;
                    return (
                      <div
                        key={activity.id}
                        className={`p-4 rounded-md border-2 border-ink ${isLog ? 'bg-surface' : 'bg-canvas'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-sans font-bold text-ink text-sm flex items-center gap-2">
                            {activity.author}
                            {isLog && (
                              <span className="font-mono text-[10px] bg-line/20 px-2 py-0.5 rounded-full text-ink-muted uppercase">
                                {(activity as AuditLog).action.replace('_', ' ')}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-ink-muted uppercase">
                            {new Date(activity.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className={`font-sans text-sm text-ink ${!isLog && 'whitespace-pre-wrap'}`}>
                          {isLog ? (activity as AuditLog).details : (activity as Comment).content}
                        </p>
                      </div>
                    );
                  })}
                  {activities.length === 0 && (
                    <p className="text-sm font-sans text-ink-muted italic">No activity yet.</p>
                  )}

                  <form onSubmit={handleAddComment} className="mt-6">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="w-full bg-surface border-2 border-ink rounded-md p-3 font-sans text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-navy"
                      rows={3}
                      disabled={isSubmittingComment}
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={!newComment.trim() || isSubmittingComment}
                        className="px-4 py-2 bg-ink text-white text-xs font-mono font-bold uppercase tracking-wider rounded-md hover:bg-ink/90 disabled:opacity-50 transition-colors"
                      >
                        {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            </div>

            <aside className="w-full lg:w-72 min-w-0 shrink-0 space-y-8">
              <div className="bg-canvas p-6 rounded-md border-2 border-ink">
                <h3 className="font-mono text-xs font-bold text-ink uppercase tracking-[0.2em] mb-4">
                  Customer Details
                </h3>
                <div className="space-y-4 font-sans font-medium text-sm text-ink">
                  <div>
                    <p className="font-mono text-[10px] text-ink-muted uppercase tracking-wider mb-1">Name</p>
                    <p className="font-bold">{ticket.customerName}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-ink-muted uppercase tracking-wider mb-1">Email</p>
                    <p className="font-bold break-all">{ticket.customerEmail || 'N/A'}</p>
                  </div>
                  <Link
                    to={`/customers/${ticket.customerId}`}
                    className="inline-block mt-4 text-ink underline font-mono text-xs font-bold uppercase tracking-wider hover:text-navy"
                  >
                    View full profile
                  </Link>
                </div>
              </div>

              <div className="font-mono text-[10px] font-bold text-ink-muted uppercase tracking-wider space-y-2">
                <p>CREATED: {new Date(ticket.createdAt).toLocaleString()}</p>
                <p>UPDATED: {new Date(ticket.updatedAt).toLocaleString()}</p>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteDialog}
        title="Delete this ticket?"
        description="This action is permanent and cannot be undone. The ticket record will be removed from the system."
        icon={
          <div className="w-[72px] h-[72px] rounded-full bg-[#faebea] flex items-center justify-center mx-auto">
            <Trash2 className="w-8 h-8 text-white" fill="white" />
          </div>
        }
        confirmText="Delete Ticket"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog(false)}
        isLoading={isDeleting}
        error={deleteError}
        isDestructive={true}
      >
        <div className="w-full border border-ink rounded-lg p-4 text-center bg-surface">
          <p className="font-mono text-xs font-medium text-ink mb-2">Id</p>
          <p className="font-sans font-bold text-ink text-[15px] truncate mb-2">{ticket.title}</p>
          <p className="font-sans text-[13px] text-ink-muted">Customer: {ticket.customerName}</p>
        </div>
      </ConfirmModal>
    </motion.div>
  );
}
