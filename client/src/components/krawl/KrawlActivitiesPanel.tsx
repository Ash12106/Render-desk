import { useState } from 'react';
import { useKrawlActivities } from '../../hooks/useKrawl';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';

export default function KrawlActivitiesPanel() {
  const [page, setPage] = useState(1);
  const { data: activities, isLoading, error } = useKrawlActivities(page);

  if (isLoading) {
    return (
      <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-6">Recent Suspicious Activities</h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-700 rounded p-4 h-16">
              <Skeleton className="h-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !activities) {
    return (
      <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Suspicious Activities</h2>
        <div className="bg-red-500/10 border border-red-500/50 rounded p-4 text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Failed to load activities
        </div>
      </div>
    );
  }

  const activityList = activities?.activities || [];

  return (
    <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-6">Recent Suspicious Activities</h2>

      {activityList.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No suspicious activities detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activityList.map((activity: any, idx: number) => (
            <div
              key={idx}
              className="bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg p-4 transition-colors cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-red-500/20 text-red-300 whitespace-nowrap">
                      {activity.attack_type || 'SUSPICIOUS'}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(activity.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-200 truncate">
                    <span className="font-mono text-blue-400">{activity.ip}</span>
                    <span className="text-slate-400"> • {activity.user_agent?.substring(0, 50)}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Path: <span className="font-mono">{activity.path}</span>
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(activities?.total_pages || 1) > 1 && (
        <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-600">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">
            Page {page} of {activities?.total_pages || 1}
          </span>
          <button
            disabled={page >= (activities?.total_pages || 1)}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
