import { useKrawlStats } from '../../hooks/useKrawl';
import { Activity, Shield, AlertTriangle, Eye } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';

export default function KrawlStatsOverview() {
  const { data: stats, isLoading, error } = useKrawlStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-700 rounded-lg p-6 h-32">
            <Skeleton className="h-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-200">
        Failed to load statistics
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Requests',
      value: stats.total_requests || 0,
      icon: Activity,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Suspicious Activities',
      value: stats.suspicious_count || 0,
      icon: AlertTriangle,
      color: 'from-orange-500 to-orange-600',
    },
    {
      title: 'Blocked IPs',
      value: stats.blocked_ips || 0,
      icon: Shield,
      color: 'from-red-500 to-red-600',
    },
    {
      title: 'Unique Visitors',
      value: stats.unique_visitors || 0,
      icon: Eye,
      color: 'from-purple-500 to-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {statCards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className={`bg-gradient-to-br ${card.color} rounded-lg p-6 text-white shadow-lg hover:shadow-xl transition-shadow`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium opacity-90">{card.title}</h3>
              <Icon className="w-5 h-5 opacity-75" />
            </div>
            <div className="text-3xl font-bold">{card.value.toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}
