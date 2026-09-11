import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/api';
import { useToast } from '@/src/components/ui/Toast';
import { GoogleLogin } from '@react-oauth/google';
import { getGoogleClientId } from '@/src/lib/google';

export function StaffProfile() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.getProfile });
  const availabilityMutation = useMutation({
    mutationFn: api.updateAvailability,
    onMutate: async (isAvailable) => {
      await queryClient.cancelQueries({ queryKey: ['profile'] });
      const previousProfile = queryClient.getQueryData<typeof profile.data>(['profile']);
      if (previousProfile) queryClient.setQueryData(['profile'], { ...previousProfile, isAvailable });
      return { previousProfile };
    },
    onError: (error: Error, _isAvailable, context) => {
      if (context?.previousProfile) queryClient.setQueryData(['profile'], context.previousProfile);
      showToast(error.message || 'Could not update availability.', 'error');
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(['profile'], updatedProfile);
      localStorage.setItem('auth_user', JSON.stringify(updatedProfile));
      showToast(
        updatedProfile.isAvailable === false
          ? 'You are now unavailable for new assignments.'
          : 'You are available for new assignments.',
      );
    },
  });
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ displayName: '', email: '', phone: '' });
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const googleClientId = getGoogleClientId();
  useEffect(() => {
    if (!profile.data) return;
    setDetails({
      displayName: profile.data.displayName || profile.data.username,
      email: profile.data.email || '',
      phone: profile.data.phone || '',
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
        {account.role === 'staff' && (
          <label className="mt-5 inline-flex items-center gap-3 border-2 border-ink rounded-md px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              aria-label="Available for new assignments"
              checked={account.isAvailable !== false}
              disabled={availabilityMutation.isPending}
              onChange={(event) => availabilityMutation.mutate(event.target.checked)}
              className="h-5 w-5 accent-success"
            />
            <span>
              <span className="block text-xs font-mono font-bold uppercase">
                {account.isAvailable !== false ? 'Available' : 'Unavailable'}
              </span>
              <span className="block text-xs text-ink-muted mt-1">
                Controls whether admins can assign new tickets to you.
              </span>
            </span>
          </label>
        )}
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
              inputMode="numeric"
              maxLength={10}
              pattern="[0-9]{10}"
              value={details.phone}
              onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="10-digit phone number"
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
        {editing && (
          <p className="mt-3 text-xs text-ink-muted">
            Team and branch assignments can only be changed by an administrator.
          </p>
        )}
      </section>
      <section className="bg-surface border-2 border-ink rounded-md p-6">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider mb-2">Google sign-in</h2>
        <p className="text-sm text-ink-muted mb-4">
          Link your Google account after signing in with the temporary credentials provided by an administrator.
        </p>
        {account.googleId ? (
          <p className="text-sm font-semibold text-success">Google account linked.</p>
        ) : googleClientId ? (
          <GoogleLogin
            onSuccess={async ({ credential }) => {
              if (!credential) return showToast('Google did not return a valid credential.', 'error');
              try {
                setLinkingGoogle(true);
                const linkedAccount = await api.linkGoogleAccount(credential);
                queryClient.setQueryData(['profile'], linkedAccount);
                localStorage.setItem('auth_user', JSON.stringify(linkedAccount));
                showToast('Google account linked. You can use Google sign-in next time.');
              } catch (error: any) {
                showToast(error.message || 'Could not link Google account.', 'error');
              } finally {
                setLinkingGoogle(false);
              }
            }}
            onError={() => showToast('Google sign-in was cancelled or failed.', 'error')}
          />
        ) : (
          <p className="text-sm text-danger">Google sign-in is not configured.</p>
        )}
        {linkingGoogle && <p className="mt-3 text-xs text-ink-muted">Linking Google account...</p>}
      </section>
    </div>
  );
}
