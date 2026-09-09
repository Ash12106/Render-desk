import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/api';
import { User } from '@/src/types';

export function StaffProfile() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.getProfile });
  const isAdmin = profile.data?.role === 'admin';
  const users = useQuery({ queryKey: ['admin-users'], queryFn: api.getAdminUsers, enabled: isAdmin });
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'staff' }) => api.updateStaffRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const createMutation = useMutation({
    mutationFn: api.createStaffAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setForm({
        username: '',
        password: '',
        displayName: '',
        email: '',
        phone: '',
        role: 'staff',
        team: 'Support',
        branch: 'Head Office',
      });
    },
  });
  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    email: '',
    phone: '',
    role: 'staff' as 'admin' | 'staff',
    team: 'Support',
    branch: 'Head Office',
  });
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ displayName: '', email: '', phone: '', team: '', branch: '' });
  useEffect(() => {
    if (!profile.data) return;
    setDetails({
      displayName: profile.data.displayName || profile.data.username,
      email: profile.data.email || '',
      phone: profile.data.phone || '',
      team: profile.data.team || '',
      branch: profile.data.branch || '',
    });
  }, [profile.data]);

  if (profile.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (profile.error || !profile.data) return <p className="p-8 text-danger">Unable to load profile.</p>;
  const account = profile.data;
  const field = (label: string, value: string | undefined) => (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase text-ink-muted mb-1">{label}</p>
      <p className="text-sm font-medium text-ink">{value || 'Not provided'}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-8 pb-16">
      <div className="border-b-2 border-ink pb-6">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted mb-2">Account profile</p>
        <h1 className="text-4xl font-sans font-black text-ink">{account.displayName || account.username}</h1>
        <p className="text-sm text-ink-muted mt-2">{account.role === 'admin' ? 'Administrator' : 'Support staff'}</p>
      </div>
      <section className="bg-surface border-2 border-ink rounded-md p-6">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider mb-5">Basic and contact information</h2>
        {editing ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await api.updateProfile(details);
              await profile.refetch();
              setEditing(false);
            }}
            className="grid sm:grid-cols-2 gap-3"
          >
            <input
              required
              value={details.displayName}
              onChange={(e) => setDetails({ ...details, displayName: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Display name"
            />
            <input
              required
              type="email"
              value={details.email}
              onChange={(e) => setDetails({ ...details, email: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Email"
            />
            <input
              value={details.phone}
              onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Phone"
            />
            <input
              required
              value={details.team}
              onChange={(e) => setDetails({ ...details, team: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Team"
            />
            <input
              required
              value={details.branch}
              onChange={(e) => setDetails({ ...details, branch: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Branch"
            />
            <button className="bg-ink text-white rounded-md p-3 font-mono text-xs font-bold uppercase">
              Save details
            </button>
          </form>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {field('Display name', account.displayName)}
            {field('Username', account.username)}
            {field('Role', account.role)}
            {field('Email', account.email)}
            {field('Phone', account.phone)}
            {field('Created', new Date(account.createdAt).toLocaleString())}
            {field('Last updated', new Date(account.updatedAt).toLocaleString())}
            {field('Team', account.team)}
            {field('Branch', account.branch)}
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="mt-6 font-mono text-xs font-bold uppercase underline"
        >
          {editing ? 'Cancel' : 'Edit profile details'}
        </button>
      </section>
      {isAdmin && (
        <section className="bg-surface border-2 border-ink rounded-md p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider mb-5">Staff account management</h2>
          <p className="text-sm text-ink-muted mb-5">
            Only administrators can create staff accounts or change account roles.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate(form);
            }}
            className="grid sm:grid-cols-2 gap-3 mb-8"
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
            <input
              required
              placeholder="Team"
              value={form.team}
              onChange={(e) => setForm({ ...form, team: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
            />
            <input
              required
              placeholder="Branch"
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
              className="sm:col-span-2 bg-ink text-white rounded-md p-3 font-mono text-xs font-bold uppercase"
            >
              Create account
            </button>
          </form>
          <div className="space-y-2">
            {users.data?.map((user: User) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-line rounded-md p-3"
              >
                <span className="text-sm font-bold">
                  {user.displayName || user.username}{' '}
                  <span className="text-ink-muted font-normal">
                    ({user.username}) · {user.team || 'No team'} · {user.branch || 'No branch'} · Working{' '}
                    {user.working || 0} · Solved {user.solved || 0}
                  </span>
                </span>
                <select
                  value={user.role}
                  disabled={user.id === account.id || roleMutation.isPending}
                  onChange={(e) => roleMutation.mutate({ id: user.id, role: e.target.value as 'admin' | 'staff' })}
                  className="border border-ink rounded p-2 text-xs font-mono uppercase"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
