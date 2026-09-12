import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Search, X } from 'lucide-react';
import { api } from '@/src/api';
import { KnowledgeBaseArticle } from '@/src/types';
import { getStoredAuthUser } from '@/src/lib/auth';

export function KnowledgeBase() {
  const currentUser = getStoredAuthUser();
  const [search, setSearch] = useState('');
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeBaseArticle | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(
      () => {
        void api
          .getKnowledgeBase(search.trim() || undefined)
          .then((data) => live && setArticles(data))
          .catch(() => live && setError('Unable to load help articles right now.'))
          .finally(() => live && setLoading(false));
      },
      search ? 250 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b-2 border-ink pb-7">
          <div className="mb-5">
            {currentUser ? (
              <Link
                className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase underline"
                to={currentUser.role === 'customer' ? '/customer' : '/tickets'}
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Back to {currentUser.role === 'customer' ? 'customer portal' : 'ticket queue'}
              </Link>
            ) : (
              <Link className="font-mono text-xs font-bold uppercase underline" to="/customer/login">
                Customer sign in
              </Link>
            )}
          </div>
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">Support centre</p>
            <h1 className="mt-2 text-4xl font-sans font-black">How can we help?</h1>
            <p className="mt-2 text-ink-muted">Practical answers for common support questions.</p>
          </div>
        </header>
        <label className="relative block" htmlFor="article-search">
          <span className="sr-only">Search help articles</span>
          <Search aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input
            id="article-search"
            value={search}
            onChange={(event) => {
              setLoading(true);
              setError('');
              setSearch(event.target.value);
            }}
            placeholder="Search for an answer"
            className="w-full rounded-md border-2 border-ink bg-surface py-4 pl-12 pr-4 font-sans focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md border border-danger p-4 text-danger">
            {error}
          </p>
        )}
        {loading ? (
          <div className="h-36 animate-pulse rounded-md border-2 border-ink bg-surface" />
        ) : articles.length ? (
          <section aria-label="Help articles" className="grid gap-4 sm:grid-cols-2">
            {articles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => setSelectedArticle(article)}
                className="rounded-md border-2 border-ink bg-surface p-5 text-left transition-colors hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
                aria-label={`Read article: ${article.title}`}
              >
                <div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase text-ink-muted">
                  <BookOpen aria-hidden="true" className="h-4 w-4" />
                  {article.category}
                </div>
                <h2 className="text-xl font-bold">{article.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{article.summary || article.content}</p>
                <span className="mt-4 block font-mono text-xs font-bold uppercase underline">Read article</span>
              </button>
            ))}
          </section>
        ) : (
          <p className="rounded-md border-2 border-dashed border-ink p-10 text-center text-ink-muted">
            No articles match that search yet. Please contact support if you still need help.
          </p>
        )}
      </div>
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          role="presentation"
          onMouseDown={() => setSelectedArticle(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-md border-2 border-ink bg-surface p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  <BookOpen aria-hidden="true" className="h-4 w-4" />
                  {selectedArticle.category}
                </p>
                <h2 id="article-title" className="mt-3 text-3xl font-sans font-black">
                  {selectedArticle.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArticle(null)}
                className="rounded p-2 text-ink hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-navy"
                aria-label="Close article"
                autoFocus
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-lg text-ink-muted">{selectedArticle.summary}</p>
            <div className="mt-6 whitespace-pre-wrap border-t border-line pt-6 leading-7 text-ink">
              {selectedArticle.content}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
