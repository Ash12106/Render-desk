import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/api';
import { GoogleLogin } from '@react-oauth/google';
import { getGoogleClientId } from '@/src/lib/google';

export function CustomerLogin() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const googleClientId = getGoogleClientId();

  const finishLogin = (user: Awaited<ReturnType<typeof api.login>>) => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    navigate('/customer');
    window.location.reload();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user =
        mode === 'login'
          ? await api.login({ username: form.username, password: form.password })
          : await api.registerCustomer(form);
      finishLogin(user);
    } catch (err: any) {
      setError(err.message || 'Unable to continue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface border-2 border-ink p-8 rounded-lg shadow-[8px_8px_0px_0px_rgba(23,32,43,1)]"
      >
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted mb-3">Customer Support</p>
        <h1 className="text-3xl font-sans font-black text-ink mb-2">Your support space</h1>
        <p className="text-sm text-ink-muted mb-8">Raise requests, follow progress, and see replies in one place.</p>
        <div className="grid grid-cols-2 border-2 border-ink rounded-md p-1 mb-6">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`py-2 font-mono text-xs font-bold uppercase ${mode === item ? 'bg-ink text-white' : 'text-ink'}`}
            >
              {item === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
        {error && (
          <div className="mb-6 p-4 bg-danger-bg border border-danger text-danger text-sm rounded-md">{error}</div>
        )}
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <>
              <label className="block font-mono text-xs font-bold uppercase">
                Full name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-2 w-full bg-surface border-2 border-ink rounded-md p-3"
                />
              </label>
              <label className="block font-mono text-xs font-bold uppercase">
                Email
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-2 w-full bg-surface border-2 border-ink rounded-md p-3"
                />
              </label>
            </>
          )}
          <label className="block font-mono text-xs font-bold uppercase">
            Username
            <input
              required
              minLength={3}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="mt-2 w-full bg-surface border-2 border-ink rounded-md p-3"
            />
          </label>
          <label className="block font-mono text-xs font-bold uppercase">
            Password
            <input
              required
              minLength={8}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-2 w-full bg-surface border-2 border-ink rounded-md p-3"
            />
          </label>
          <button
            disabled={loading}
            className="w-full py-3 bg-ink text-white font-mono font-bold text-sm uppercase rounded-md disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in as customer' : 'Create customer account'}
          </button>
        </form>
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-[10px] font-mono font-bold uppercase text-ink-muted">
            <span className="h-px flex-1 bg-line" /> Or continue with <span className="h-px flex-1 bg-line" />
          </div>
          {googleClientId ? (
            <GoogleLogin
              onSuccess={async ({ credential }) => {
                if (!credential) return setError('Google did not return a valid credential.');
                try {
                  setLoading(true);
                  finishLogin(await api.loginWithGoogle(credential));
                } catch (err: any) {
                  setError(err.message || 'Google sign-in failed.');
                } finally {
                  setLoading(false);
                }
              }}
              onError={() => setError('Google sign-in failed. Please try again.')}
            />
          ) : (
            <button
              type="button"
              disabled
              title="Configure VITE_GOOGLE_CLIENT_ID to enable Google sign-in"
              className="w-full rounded-md border-2 border-line bg-surface py-3 font-mono text-xs font-bold uppercase text-ink-muted"
            >
              Continue with Google
            </button>
          )}
          {!googleClientId && (
            <p className="text-center text-[10px] font-mono text-ink-muted">
              Google sign-in needs OAuth configuration.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 w-full text-center text-xs font-mono font-bold uppercase underline"
        >
          Staff sign in
        </button>
      </motion.div>
    </div>
  );
}
