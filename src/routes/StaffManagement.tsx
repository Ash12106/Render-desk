import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Plus, Save, UsersRound } from 'lucide-react';
import { api } from '@/src/api';
import { User } from '@/src/types';

const initialForm = {
  username: '',
  password: '',
  displayName: '',
  email: '',
  phone: '',
  role: 'staff' as 'admin' | 'staff',
  team: 'Technical Support',
  branch: 'Head Office',
};

export function StaffManagement() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.getProfile });
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.getAdminUsers,
    enabled: profile.data?.role === 'admin',
  });
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ displayName: '', email: '', phone: '', team: '', branch: '' });
  const [selectedTeam, setSelectedTeam] = useState('All teams');
  const createMutation = useMutation({
    mutationFn: api.createStaffAccount,
    onSuccess: () => {
      setForm(initialForm);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
  const profileMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof draft }) => api.updateStaffDetails(id, data),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'staff' }) => api.updateStaffRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (profile.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (profile.isError)
    return (
      <p role="alert" className="p-8 text-danger">
        Unable to load your profile. Please try again.
      </p>
    );
  if (!profile.data || profile.data.role !== 'admin') {
    return <p className="p-8 text-danger">Administrator access is required to manage staff.</p>;
  }
  if (users.isPending)
    return (
      <p role="status" className="p-8">
        Loading staff accounts...
      </p>
    );
  if (users.isError)
    return (
      <p role="alert" className="p-8 text-danger">
        Unable to load staff accounts. {users.error.message}
      </p>
    );

  const mutationError = createMutation.error || profileMutation.error || roleMutation.error;
  const staff = users.data || [];
  const admins = staff.filter((user) => user.role === 'admin');
  const staffMembers = staff.filter((user) => user.role === 'staff');
  const teams = Array.from(new Set(staffMembers.map((user) => user.team).filter(Boolean)));
  const teamOptions = Array.from(
    new Set(['Finance', 'Technical Support', 'Sales', 'Operations', 'Customer Success', ...teams]),
  );
  const visibleStaff =
    selectedTeam === 'All teams' ? staffMembers : staffMembers.filter((user) => user.team === selectedTeam);
  const teamCount = (team: string) => staffMembers.filter((user) => user.team === team).length;
  const renderAccount = (user: User) =>
    editingId === user.id ? (
      <div key={user.id} className="p-5 grid sm:grid-cols-2 gap-3">
        <input
          aria-label="Staff display name"
          value={draft.displayName}
          onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
          className="border border-ink rounded p-2"
          placeholder="Display name"
        />
        <input
          aria-label="Staff email"
          type="email"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          className="border border-ink rounded p-2"
          placeholder="Email"
        />
        <input
          aria-label="Staff phone"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          className="border border-ink rounded p-2"
          placeholder="Phone"
        />
        <select
          aria-label="Staff team"
          required
          value={draft.team}
          onChange={(e) => setDraft({ ...draft, team: e.target.value })}
          className="border border-ink rounded p-2"
        >
          <option value="">Select team / group</option>
          {teamOptions.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
        <input
          aria-label="Staff branch"
          required
          value={draft.branch}
          onChange={(e) => setDraft({ ...draft, branch: e.target.value })}
          className="border border-ink rounded p-2"
          placeholder="Branch"
        />
        <div className="flex gap-2 items-center">
          <button
            type="button"
            disabled={profileMutation.isPending}
            onClick={() => profileMutation.mutate({ id: user.id, data: draft })}
            className="inline-flex items-center gap-2 bg-ink text-white rounded px-3 py-2 text-xs font-mono font-bold uppercase"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="text-xs font-mono font-bold uppercase underline"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div key={user.id} className="p-5 flex flex-col gap-4 border-b border-line last:border-b-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-bold text-lg">{user.displayName || user.username}</p>
            <p className="text-xs text-ink-muted mt-1">
              {user.username} · {user.email || 'No email'}
            </p>
            <span
              className={`inline-block mt-2 rounded-full px-2 py-1 text-[10px] font-mono font-bold uppercase ${user.isAvailable === false ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}
            >
              {user.isAvailable === false ? 'Unavailable' : 'Available'}
            </span>
          </div>
          <span className="self-start rounded-full border border-line px-3 py-1 text-[10px] font-mono font-bold uppercase">
            {user.role}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="font-mono text-[10px] uppercase text-ink-muted">Team / group</p>
            <p className="font-medium mt-1">{user.team || 'No team'}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-ink-muted">Branch</p>
            <p className="font-medium mt-1">{user.branch || 'No branch'}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-ink-muted">Workload</p>
            <p className="font-medium mt-1">
              {user.working || 0} active · {user.solved || 0} solved
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingId(user.id);
              setDraft({
                displayName: user.displayName || user.username,
                email: user.email || '',
                phone: user.phone || '',
                team: user.team || '',
                branch: user.branch || '',
              });
            }}
            className="border border-ink rounded px-3 py-2 text-xs font-mono font-bold uppercase"
          >
            Edit profile
          </button>
          <select
            aria-label={`Role for ${user.displayName || user.username}`}
            value={user.role}
            disabled={user.id === profile.data.id || roleMutation.isPending}
            onChange={(e) => roleMutation.mutate({ id: user.id, role: e.target.value as 'admin' | 'staff' })}
            className="border border-ink rounded px-2 py-2 text-xs font-mono uppercase"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-4 space-y-8 pb-16">
      <header className="border-b-2 border-ink pb-6">
        <div className="flex items-center gap-3 text-ink-muted mb-2">
          <BriefcaseBusiness className="w-5 h-5" />
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Admin workspace</p>
        </div>
        <h1 className="text-4xl font-black">Staff account management</h1>
        <p className="text-sm text-ink-muted mt-2">
          Create staff accounts and keep teams, branches, and access roles accurate.
        </p>
      </header>

      {mutationError && (
        <p role="alert" className="p-4 border border-danger text-danger rounded-md">
          {mutationError.message}
        </p>
      )}

      <section className="bg-surface border-2 border-ink rounded-md p-6">
        <div className="flex items-center gap-3 mb-5">
          <Plus className="w-5 h-5" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Add a staff member</h2>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate(form);
          }}
          className="grid sm:grid-cols-2 gap-3"
        >
          <input
            required
            placeholder="Display name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          />
          <input
            required
            type="email"
            placeholder="Work email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          />
          <input
            required
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          />
          <input
            required
            minLength={8}
            type="password"
            placeholder="Temporary password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          />
          <select
            required
            aria-label="Team or group"
            value={form.team}
            onChange={(e) => setForm({ ...form, team: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          >
            <option value="">Select team / group</option>
            {teamOptions.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Branch e.g. Head Office"
            value={form.branch}
            onChange={(e) => setForm({ ...form, branch: e.target.value })}
            className="border-2 border-ink rounded-md p-3"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'staff' })}
            className="border-2 border-ink rounded-md p-3"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <button
            disabled={createMutation.isPending}
            className="sm:col-span-2 inline-flex items-center justify-center gap-2 bg-ink text-white rounded-md p-3 font-mono text-xs font-bold uppercase disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? 'Creating...' : 'Create account'}
          </button>
        </form>
      </section>

      <section className="bg-surface border-2 border-ink rounded-md overflow-hidden">
        <div className="p-5 border-b border-line flex items-center gap-3">
          <UsersRound className="w-5 h-5" />
          <div>
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Teams / Groups</h2>
            <p className="text-sm text-ink-muted mt-1">Select a team to see its assigned staff and current workload.</p>
          </div>
        </div>
        <div className="border-b border-line bg-canvas p-4">
          <label
            className="block font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2"
            htmlFor="team-filter"
          >
            Choose a team / group
          </label>
          <select
            id="team-filter"
            aria-label="Choose a team or group"
            value={selectedTeam}
            onChange={(event) => setSelectedTeam(event.target.value)}
            className="w-full bg-surface border-2 border-ink rounded-md px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-navy/30"
          >
            <option value="All teams">All teams ({staffMembers.length})</option>
            {teamOptions.map((team) => (
              <option key={team} value={team}>
                {team} ({teamCount(team)})
              </option>
            ))}
          </select>
        </div>
        <div className="divide-y divide-line">
          <details open className="group">
            <summary className="cursor-pointer list-none p-4 bg-line/20 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Administrators ({admins.length})</span>
              <span className="text-lg leading-none group-open:rotate-45 transition-transform">+</span>
            </summary>
            {admins.length ? (
              admins.map(renderAccount)
            ) : (
              <p className="p-5 text-sm text-ink-muted">No administrator accounts.</p>
            )}
          </details>
          <details open className="group">
            <summary className="cursor-pointer list-none p-4 bg-line/20 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-between">
              <span>
                {selectedTeam} staff ({visibleStaff.length})
              </span>
              <span className="text-lg leading-none group-open:rotate-45 transition-transform">+</span>
            </summary>
            {visibleStaff.length ? (
              visibleStaff.map(renderAccount)
            ) : (
              <p className="p-5 text-sm text-ink-muted">No staff assigned to this team.</p>
            )}
          </details>
        </div>
      </section>
    </div>
  );
}
