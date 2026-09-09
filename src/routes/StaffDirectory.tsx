import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, UsersRound } from 'lucide-react';
import { api } from '@/src/api';
import { User } from '@/src/types';

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString() : 'Not available';
}

export function StaffDirectory() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.getProfile });
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.getAdminUsers,
    enabled: profile.data?.role === 'admin',
  });

  if (profile.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (profile.error || !profile.data) return <p className="p-8 text-danger">Unable to verify administrator access.</p>;
  if (profile.data.role !== 'admin') {
    return <p className="p-8 text-danger">Administrator access is required to view staff reporting.</p>;
  }

  const staff = users.data || [];
  const totalWorking = staff.reduce((total, user) => total + (user.working || 0), 0);
  const totalSolved = staff.reduce((total, user) => total + (user.solved || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-8 pb-16">
      <div className="border-b-2 border-ink pb-6">
        <div className="flex items-center gap-3 text-ink-muted mb-2">
          <UsersRound className="w-5 h-5" />
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Admin reporting</p>
        </div>
        <h1 className="text-4xl font-sans font-black text-ink">Staff directory</h1>
        <p className="text-sm text-ink-muted mt-2">Track team workload, progress, and account details in one place.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          ['Team members', staff.length],
          ['Open workload', totalWorking],
          ['Resolved tickets', totalSolved],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface border-2 border-ink rounded-md p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
            <p className="text-3xl font-black mt-2">{value}</p>
          </div>
        ))}
      </div>

      <section className="bg-surface border-2 border-ink rounded-md overflow-hidden">
        <div className="p-5 border-b border-line flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Staff profiles and progress</h2>
        </div>
        {users.isPending ? (
          <div className="p-6 text-sm text-ink-muted">Loading staff directory...</div>
        ) : users.error ? (
          <div className="p-6 text-sm text-danger">Unable to load staff reporting.</div>
        ) : (
          <div className="divide-y divide-line">
            {staff.map((user: User) => {
              const active = user.working || 0;
              const solved = user.solved || 0;
              const total = active + solved;
              const progress = total ? Math.round((solved / total) * 100) : 0;
              return (
                <div
                  key={user.id}
                  className="p-5 grid lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-5 items-center"
                >
                  <div>
                    <p className="font-bold">{user.displayName || user.username}</p>
                    <p className="text-xs text-ink-muted mt-1">
                      {user.username} · {user.team || 'No team'} · {user.branch || 'No branch'}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase text-ink-muted">Joining date</p>
                    <p className="text-sm font-medium mt-1">{formatDate(user.joiningDate || user.createdAt)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase text-ink-muted">Working</p>
                    <p className="text-xl font-black mt-1">{active}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase text-ink-muted">Solved</p>
                    <p className="text-xl font-black mt-1">{solved}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase text-ink-muted">Progress</p>
                    <p className="text-xl font-black mt-1">{progress}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
