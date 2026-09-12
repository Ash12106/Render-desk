import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, MessageSquareText, Trash2 } from 'lucide-react';
import { api } from '@/src/api';

export function WorkflowLibrary() {
  const queryClient = useQueryClient();
  const replies = useQuery({ queryKey: ['canned-replies'], queryFn: api.getCannedReplies });
  const articles = useQuery({ queryKey: ['admin-knowledge-base'], queryFn: api.getAdminKnowledgeBase });
  const [reply, setReply] = useState({ title: '', category: 'General', content: '' });
  const [article, setArticle] = useState({ title: '', category: 'General', summary: '', content: '', published: true });
  const [articleValidationError, setArticleValidationError] = useState('');
  const createReply = useMutation({
    mutationFn: api.createCannedReply,
    onSuccess: () => {
      setReply({ title: '', category: 'General', content: '' });
      void queryClient.invalidateQueries({ queryKey: ['canned-replies'] });
    },
  });
  const createArticle = useMutation({
    mutationFn: api.createKnowledgeBaseArticle,
    onSuccess: () => {
      setArticle({ title: '', category: 'General', summary: '', content: '', published: true });
      setArticleValidationError('');
      void queryClient.invalidateQueries({ queryKey: ['admin-knowledge-base'] });
    },
  });
  const deleteArticle = useMutation({
    mutationFn: api.deleteKnowledgeBaseArticle,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-knowledge-base'] });
    },
  });
  const error = createReply.error || createArticle.error || deleteArticle.error;
  const submitArticle = (event: React.FormEvent) => {
    event.preventDefault();
    if (article.title.trim().length < 3) return setArticleValidationError('Title must be at least 3 characters.');
    if (article.summary.trim().length < 10)
      return setArticleValidationError('Short summary must be at least 10 characters.');
    if (article.content.trim().length < 20)
      return setArticleValidationError(
        'Article content must be at least 20 characters so customers receive a useful answer.',
      );
    setArticleValidationError('');
    createArticle.mutate(article);
  };
  const removeArticle = (id: string, title: string) => {
    if (window.confirm(`Delete "${title}"? This cannot be undone.`)) deleteArticle.mutate(id);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16">
      <header>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">
          Administrator workflow tools
        </p>
        <h1 className="mt-2 text-4xl font-sans font-black">Reply and help library</h1>
        <p className="mt-2 text-ink-muted">Give staff approved language and customers useful self-service answers.</p>
      </header>
      {error && (
        <p role="alert" className="rounded-md border border-danger p-4 text-danger">
          {error.message}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border-2 border-ink bg-surface p-5">
          <div className="mb-5 flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Canned replies</h2>
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createReply.mutate(reply);
            }}
          >
            <label className="block text-sm font-bold">
              Title
              <input
                required
                value={reply.title}
                onChange={(event) => setReply({ ...reply, title: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
                placeholder="Example: Billing information needed"
              />
            </label>
            <label className="block text-sm font-bold">
              Category
              <input
                required
                value={reply.category}
                onChange={(event) => setReply({ ...reply, category: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
              />
            </label>
            <label className="block text-sm font-bold">
              Reply text
              <textarea
                required
                rows={4}
                value={reply.content}
                onChange={(event) => setReply({ ...reply, content: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
                placeholder="Write the approved response staff can use."
              />
            </label>
            <button
              disabled={createReply.isPending}
              className="rounded bg-ink px-4 py-2 font-mono text-xs font-bold uppercase text-white disabled:opacity-50"
            >
              {createReply.isPending ? 'Saving...' : 'Add canned reply'}
            </button>
          </form>
          <div className="mt-6 space-y-2">
            {replies.isPending ? (
              <p>Loading replies…</p>
            ) : replies.data?.length ? (
              replies.data.map((item) => (
                <article key={item.id} className="rounded border border-line bg-canvas p-3">
                  <p className="font-bold">
                    {item.title} <span className="font-mono text-xs text-ink-muted">{item.category}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{item.content}</p>
                </article>
              ))
            ) : (
              <p className="rounded border-2 border-dashed border-ink p-4 text-sm text-ink-muted">
                No canned replies yet. Add one above and staff will see it when writing a ticket reply.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-md border-2 border-ink bg-surface p-5">
          <div className="mb-5 flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Knowledge base</h2>
          </div>
          <form className="space-y-3" onSubmit={submitArticle} noValidate>
            <label className="block text-sm font-bold">
              Title
              <input
                required
                minLength={3}
                value={article.title}
                onChange={(event) => setArticle({ ...article, title: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
                placeholder="Example: Reset your account password"
              />
            </label>
            <label className="block text-sm font-bold">
              Category
              <input
                required
                value={article.category}
                onChange={(event) => setArticle({ ...article, category: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
              />
            </label>
            <label className="block text-sm font-bold">
              Short summary
              <textarea
                required
                minLength={10}
                rows={2}
                value={article.summary}
                onChange={(event) => setArticle({ ...article, summary: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
                aria-describedby="summary-help"
              />
            </label>
            <p id="summary-help" className="-mt-2 text-xs text-ink-muted">
              At least 10 characters.
            </p>
            <label className="block text-sm font-bold">
              Article content
              <textarea
                required
                minLength={20}
                rows={4}
                value={article.content}
                onChange={(event) => setArticle({ ...article, content: event.target.value })}
                className="mt-1 w-full rounded border-2 border-ink p-2"
                aria-describedby="content-help"
              />
            </label>
            <p id="content-help" className="-mt-2 text-xs text-ink-muted">
              At least 20 characters. Explain the steps or answer customers need.
            </p>
            {articleValidationError && (
              <p role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm text-danger">
                {articleValidationError}
              </p>
            )}
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={article.published}
                onChange={(event) => setArticle({ ...article, published: event.target.checked })}
              />{' '}
              Publish for customers
            </label>
            <button
              disabled={createArticle.isPending}
              className="rounded bg-ink px-4 py-2 font-mono text-xs font-bold uppercase text-white disabled:opacity-50"
            >
              {createArticle.isPending ? 'Saving...' : 'Add help article'}
            </button>
          </form>
          <div className="mt-6 space-y-2">
            {articles.isPending ? (
              <p>Loading articles…</p>
            ) : articles.data?.length ? (
              articles.data.map((item) => (
                <article key={item.id} className="rounded border border-line bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {item.title}{' '}
                        <span className="font-mono text-xs text-ink-muted">
                          {item.published ? 'Published' : 'Draft'}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">{item.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeArticle(item.id, item.title)}
                      disabled={deleteArticle.isPending}
                      className="shrink-0 rounded border border-danger p-2 text-danger hover:bg-danger-bg focus:outline-none focus:ring-2 focus:ring-danger disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete knowledge-base article: ${item.title}`}
                      title="Delete article"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded border-2 border-dashed border-ink p-4 text-sm text-ink-muted">
                No help articles yet. Add one above to make it discoverable in the help centre.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
