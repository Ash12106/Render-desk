import React, { useState } from 'react';
import { api } from '@/src/api';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { getGoogleClientId } from '@/src/lib/google';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const googleClientId = getGoogleClientId();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    try {
      setLoading(true);
      setError(null);
      const user = await api.login({ username, password });

      // Store user to simulate session
      localStorage.setItem('auth_user', JSON.stringify(user));
      navigate('/tickets');
      // In a real app we might use context to update app state globally
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
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
        <h1 className="text-3xl font-sans font-black text-ink mb-2">Support Desk</h1>
        <p className="font-mono text-sm text-ink-muted mb-8 uppercase tracking-wider">Authentication Required</p>

        {error && (
          <div className="mb-6 p-4 bg-danger-bg border border-danger text-danger text-sm font-sans rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block font-mono text-xs font-bold text-ink uppercase tracking-wider mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border-2 border-ink rounded-md p-3 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="block font-mono text-xs font-bold text-ink uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border-2 border-ink rounded-md p-3 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy"
              placeholder="Enter password"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 bg-ink text-white font-mono font-bold text-sm uppercase tracking-wider rounded-md hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <div className="mt-6">
          {googleClientId ? (
            <GoogleLogin
              onSuccess={async ({ credential }) => {
                if (!credential) return;
                try {
                  const staff = await api.loginStaffWithGoogle(credential);
                  localStorage.setItem('auth_user', JSON.stringify(staff));
                  navigate('/tickets');
                  window.location.reload();
                } catch (err: any) {
                  setError(err.message || 'Google sign-in failed.');
                }
              }}
              onError={() => setError('Google sign-in failed.')}
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
            <p className="mt-2 text-center text-[10px] font-mono text-ink-muted">
              Google sign-in needs OAuth configuration.
            </p>
          )}
        </div>
        <Link to="/customer/login" className="mt-6 block text-center text-xs font-mono font-bold uppercase underline">
          Customer sign in or create account
        </Link>
      </motion.div>
    </div>
  );
}
