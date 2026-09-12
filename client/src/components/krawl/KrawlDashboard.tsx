import { useState } from 'react';
import { useKrawlHealth, useKrawlDashboardPath } from '../../hooks/useKrawl';
import KrawlStatsOverview from './KrawlStatsOverview';
import KrawlActivitiesPanel from './KrawlActivitiesPanel';
import KrawlIPReputation from './KrawlIPReputation';
import KrawlAuthModal from './KrawlAuthModal';
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react';

export default function KrawlDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { data: healthData, isLoading: isHealthLoading, error: healthError } = useKrawlHealth();
  const { data: dashboardPath } = useKrawlDashboardPath();

  const isHealthy = healthData?.status === 'healthy';

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    setShowAuthModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Lock className="w-8 h-8 text-blue-400" />
                Krawl Security Dashboard
              </h1>
              <p className="text-slate-400">Real-time honeypot monitoring and threat detection</p>
            </div>

            {/* Health Status Badge */}
            <div className="flex items-center gap-3 bg-slate-700/50 rounded-lg px-6 py-3 border border-slate-600">
              {isHealthLoading ? (
                <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-blue-400 rounded-full"></div>
              ) : isHealthy ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className="text-sm font-medium text-white">
                {isHealthLoading ? 'Checking...' : isHealthy ? 'Service Healthy' : 'Service Unavailable'}
              </span>
            </div>
          </div>
        </div>

        {/* Error State */}
        {healthError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-200 font-medium">Krawl Service Error</p>
              <p className="text-red-300 text-sm">
                Unable to connect to Krawl service. Please ensure it's running and accessible.
              </p>
            </div>
          </div>
        )}

        {/* Service Unavailable Warning */}
        {!isHealthLoading && !isHealthy && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-yellow-200 font-medium">Service Initializing</p>
              <p className="text-yellow-300 text-sm">
                Krawl honeypot service is starting. This may take a moment. Please refresh the page.
              </p>
            </div>
          </div>
        )}

        {/* Stats Overview */}
        <div className="mb-8">
          <KrawlStatsOverview />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left Column - Activities & Credentials */}
          <div className="lg:col-span-2 space-y-6">
            <KrawlActivitiesPanel />
          </div>

          {/* Right Column - IP Reputation */}
          <div>
            <KrawlIPReputation />
          </div>
        </div>

        {/* Direct Access Section */}
        {dashboardPath?.dashboardUrl && (
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">Direct Access</h3>
            <p className="text-slate-300 text-sm mb-4">
              Access the full Krawl dashboard directly (requires password authentication):
            </p>
            <div className="flex items-center gap-3">
              <a
                href={dashboardPath.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Open Full Dashboard
              </a>
              {!isAuthenticated && (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
                >
                  Authenticate Here
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Authentication Modal */}
      {showAuthModal && <KrawlAuthModal onSuccess={handleAuthSuccess} onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
