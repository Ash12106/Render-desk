import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { api } from '@/src/api';
import { KnowledgeBaseArticle } from '@/src/types';

export function KnowledgeBase() {
  const [search, setSearch] = useState('');
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      void api
        .getKnowledgeBase(search.trim() || undefined)
        .then((data) => live && setArticles(data))
        .catch(() => live && setError('Unable to load help articles right now.'))
        .finally(() => live && setLoading(false));
    }, search ? 250 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-col gap-5 border-b-2 border-ink pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">Support centre</p>
            <h1 className="mt-2 text-4xl font-sans font-black">How can we help?</h1>
            <p className="mt-2 text-ink-muted">Practical answers for common support questions.</p>
          </div>
          <Link className="font-mono text-xs font-bold uppercase underline" to="/customer/login">Customer sign in</Link>
        </header>
        <label className="relative block" htmlFor="article-search">
          <span className="sr-only">Search help articles</span>
          <Search aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input id="article-search" value={search} onChange={(event) => { setLoading(true); setError(''); setSearch(event.target.value); }} placeholder="Search for an answer" className="w-full rounded-md border-2 border-ink bg-surface py-4 pl-12 pr-4 font-sans focus:outline-none focus:ring-2 focus:ring-navy" />
        </label>
        {error && <p role="alert" className="rounded-md border border-danger p-4 text-danger">{error}</p>}
        {loading ? <div className="h-36 animate-pulse rounded-md border-2 border-ink bg-surface" /> : articles.length ? (
          <section aria-label="Help articles" className="grid gap-4 sm:grid-cols-2">
            {articles.map((article) => <article key={article.id} className="rounded-md border-2 border-ink bg-surface p-5"><div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase text-ink-muted"><BookOpen className="h-4 w-4" />{article.category}</div><h2 className="text-xl font-bold">{article.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{article.summary || article.content}</p></article>)}
          </section>
        ) : <p className="rounded-md border-2 border-dashed border-ink p-10 text-center text-ink-muted">No articles match that search yet. Please contact support if you still need help.</p>}
      </div>
    </main>
  );
}
