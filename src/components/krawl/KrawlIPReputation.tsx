import { useState } from 'react';
import { useKrawlIPs } from '../../hooks/useKrawl';
import { AlertCircle, Globe, TrendingUp } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';

type IPCategory = 'attacker' | 'bad_crawler' | 'good_crawler' | 'regular_user' | undefined;

const categoryColors: Record<string, string> = {
  attacker: 'bg-red-500/20 text-red-300',
  bad_crawler: 'bg-orange-500/20 text-orange-300',
  good_crawler: 'bg-green-500/20 text-green-300',
  regular_user: 'bg-blue-500/20 text-blue-300',
  unknown: 'bg-slate-500/20 text-slate-300',
};

export default function KrawlIPReputation() {
  const [selectedCategory, setSelectedCategory] = useState<IPCategory>(undefined);
  const [page, setPage] = useState(1);

  const { data: ips, isLoading, error } = useKrawlIPs(page, selectedCategory);

  if (isLoading) {
    return (
      <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6 h-full">
        <h2 className="text-xl font-bold text-white mb-6">IP Reputation</h2>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-700 rounded p-3 h-12">
              <Skeleton className="h-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !ips) {
    return (
      <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">IP Reputation</h2>
        <div className="bg-red-500/10 border border-red-500/50 rounded p-4 text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Failed to load data
        </div>
      </div>
    );
  }

  const ipList = ips?.ips || [];
  const categories = ['attacker', 'bad_crawler', 'good_crawler', 'regular_user'] as const;

  return (
    <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6 h-full flex flex-col">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-400" />
        IP Reputation
      </h2>

      {/* Category Filter */}
      <div className="mb-4 space-y-2">
        <button
          onClick={() => {
            setSelectedCategory(undefined);
            setPage(1);
          }}
          className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${
            selectedCategory === undefined
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
          }`}
        >
          All IPs
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setPage(1);
            }}
            className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors capitalize ${
              selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* IP List */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        {ipList.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No IPs in this category</p>
          </div>
        ) : (
          ipList.map((ip: any, idx: number) => (
            <div
              key={idx}
              className="bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded p-3 transition-colors group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-blue-300 truncate">{ip.ip}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                        categoryColors[ip.category || 'unknown']
                      }`}
                    >
                      {ip.category || 'unknown'}
                    </span>
                  </div>
                  {ip.country && <p className="text-xs text-slate-400 mt-1">{ip.country}</p>}
                </div>
              </div>
              {ip.score !== undefined && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-slate-600 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        ip.score > 0.7 ? 'bg-red-500' : ip.score > 0.4 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(ip.score * 100, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{(ip.score * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {(ips?.total_pages || 1) > 1 && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-600">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="flex-1 px-2 py-1 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            ← Prev
          </button>
          <button
            disabled={page >= (ips?.total_pages || 1)}
            onClick={() => setPage(page + 1)}
            className="flex-1 px-2 py-1 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
