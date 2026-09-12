import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Shield, RefreshCw } from 'lucide-react';
import { fetchJson } from '../../api';

interface KrawlStats {
  total_accesses?: number;
  unique_ips?: number;
  suspicious_accesses?: number;
  honeypot_caught?: number;
  credentials_captured?: number;
}

export function KrawlSecurityAdmin() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch Krawl health status
  const healthQuery = useQuery({
    queryKey: ['krawl-admin-health'],
    queryFn: () => fetchJson<{ status: string; message: string }>('/api/admin/krawl/health'),
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 2,
  });

  // Fetch Krawl stats from database
  const statsQuery = useQuery({
    queryKey: ['krawl-admin-stats'],
    queryFn: () => fetchJson<KrawlStats>('/api/admin/krawl/stats'),
    refetchInterval: autoRefresh ? 30000 : false,
    retry: 1,
  });

  // Fetch recent activities from database
  const activitiesQuery = useQuery({
    queryKey: ['krawl-admin-activities'],
    queryFn: () => fetchJson<any[]>('/api/admin/krawl/activities?limit=5'),
    refetchInterval: autoRefresh ? 20000 : false,
    retry: 1,
  });

  // Fetch top attacking IPs from database
  const ipsQuery = useQuery({
    queryKey: ['krawl-admin-ips'],
    queryFn: () => fetchJson<any[]>('/api/admin/krawl/ips?limit=10'),
    refetchInterval: autoRefresh ? 60000 : false,
    retry: 1,
  });

  const isHealthy = !healthQuery.isError && healthQuery.data?.status === 'healthy';
  const stats = (statsQuery.data || {}) as KrawlStats;

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="border-b-2 border-ink pb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-ink-muted">
            <Shield className="w-5 h-5" />
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Security monitoring</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              Auto-refresh
            </label>
            <button
              onClick={() => {
                healthQuery.refetch();
                statsQuery.refetch();
                activitiesQuery.refetch();
                ipsQuery.refetch();
              }}
              className="p-2 hover:bg-surface rounded transition-colors"
              title="Refresh now"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <h2 className="text-3xl font-black">Krawl Honeypot Dashboard</h2>
        <p className="text-sm text-ink-muted mt-2">
          Monitor security threats, honeypot activities, and malicious IP addresses.
        </p>
      </div>

      {/* Health Status */}
      <div className="bg-surface border-2 border-ink rounded-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-ink-muted mb-2">Service status</p>
            <h3 className="text-xl font-bold flex items-center gap-2">
              {healthQuery.isLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-ink border-t-transparent rounded-full"></div>
                  <span>Checking...</span>
                </>
              ) : isHealthy ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <span className="text-success">Healthy</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-danger" />
                  <span className="text-danger">Unavailable</span>
                </>
              )}
            </h3>
            <p className="text-sm text-ink-muted mt-2" role={healthQuery.isError ? 'alert' : undefined}>
              {healthQuery.error?.message || healthQuery.data?.message}
            </p>
          </div>
          {healthQuery.data && (
            <div className="text-right text-xs text-ink-muted">
              <p>Last checked: {new Date(healthQuery.dataUpdatedAt).toLocaleTimeString()}</p>
            </div>
          )}
        </div>
      </div>

      {statsQuery.isError && (
        <p role="alert" className="text-danger">
          {statsQuery.error.message}
        </p>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-surface border-2 border-ink rounded-md p-4">
          <p className="font-mono text-[10px] font-bold uppercase text-ink-muted mb-2">Total accesses</p>
          <p className="text-2xl font-black">
            {statsQuery.isLoading || statsQuery.isError ? '-' : (stats.total_accesses ?? 'Unavailable')}
          </p>
        </div>
        <div className="bg-surface border-2 border-ink rounded-md p-4">
          <p className="font-mono text-[10px] font-bold uppercase text-ink-muted mb-2">Unique IPs</p>
          <p className="text-2xl font-black">
            {statsQuery.isLoading || statsQuery.isError ? '-' : (stats.unique_ips ?? 'Unavailable')}
          </p>
        </div>
        <div className="bg-surface border-2 border-danger-bg rounded-md p-4">
          <p className="font-mono text-[10px] font-bold uppercase text-danger mb-2">Suspicious</p>
          <p className="text-2xl font-black text-danger">
            {statsQuery.isLoading || statsQuery.isError ? '-' : (stats.suspicious_accesses ?? 'Unavailable')}
          </p>
        </div>
        <div className="bg-surface border-2 border-ink rounded-md p-4">
          <p className="font-mono text-[10px] font-bold uppercase text-ink-muted mb-2">Honeypot hits</p>
          <p className="text-2xl font-black">
            {statsQuery.isLoading || statsQuery.isError ? '-' : (stats.honeypot_caught ?? 'Unavailable')}
          </p>
        </div>
        <div className="bg-surface border-2 border-danger-bg rounded-md p-4">
          <p className="font-mono text-[10px] font-bold uppercase text-danger mb-2">Credentials</p>
          <p className="text-2xl font-black text-danger">
            {statsQuery.isLoading || statsQuery.isError ? '-' : (stats.credentials_captured ?? 'Unavailable')}
          </p>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-surface border-2 border-ink rounded-md overflow-hidden">
        <div className="p-5 border-b border-line">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider">Recent suspicious activities</h3>
        </div>
        <div className="divide-y divide-line">
          {activitiesQuery.isLoading ? (
            <div className="p-5 text-center text-ink-muted">Loading activities...</div>
          ) : activitiesQuery.isError ? (
            <div role="alert" className="p-5 text-center text-danger">
              {activitiesQuery.error.message}
            </div>
          ) : activitiesQuery.data && activitiesQuery.data.length > 0 ? (
            activitiesQuery.data.map((activity: any, idx: number) => (
              <div key={idx} className="p-5 hover:bg-surface-hover transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-xs font-bold mb-1">{activity.ip || 'Unknown IP'}</p>
                    <p className="text-sm text-ink-muted">{activity.attack_type || 'Unknown threat'}</p>
                  </div>
                  <span className="text-[10px] font-mono text-ink-muted">
                    {activity.timestamp ? new Date(activity.timestamp).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">{activity.user_agent || 'N/A'}</p>
              </div>
            ))
          ) : (
            <div className="p-5 text-center text-ink-muted">No suspicious activities detected</div>
          )}
        </div>
      </div>

      {/* Malicious IPs */}
      <div className="bg-surface border-2 border-ink rounded-md overflow-hidden">
        <div className="p-5 border-b border-line">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider">Top attacking IPs</h3>
        </div>
        <div className="divide-y divide-line">
          {ipsQuery.isLoading ? (
            <div className="p-5 text-center text-ink-muted">Loading IPs...</div>
          ) : ipsQuery.isError ? (
            <div role="alert" className="p-5 text-center text-danger">
              {ipsQuery.error.message}
            </div>
          ) : ipsQuery.data && ipsQuery.data.length > 0 ? (
            ipsQuery.data.map((ip: any, idx: number) => (
              <div key={idx} className="p-5 hover:bg-surface-hover transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-xs font-bold">{ip.ip || 'Unknown'}</p>
                    <p className="text-sm text-ink-muted mt-1">
                      {ip.category ? `Category: ${ip.category}` : 'Unknown category'}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-ink-muted">{ip.attack_count || 0} attacks</span>
                </div>
                {ip.location && <p className="text-xs text-ink-muted">Location: {ip.location}</p>}
              </div>
            ))
          ) : (
            <div className="p-5 text-center text-ink-muted">No malicious IPs detected</div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-surface border-2 border-line rounded-md p-6">
        <p className="text-sm text-ink-muted">
          <strong>Note:</strong> This dashboard displays data collected by the Krawl honeypot system from your connected
          database. All data is refreshed automatically at regular intervals. Only administrators can access this
          security information.
        </p>
      </div>
    </div>
  );
}
