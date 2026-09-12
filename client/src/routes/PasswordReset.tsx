import { useState, type ReactNode } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { api } from '@/src/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <PasswordShell title="Forgot password" subtitle="Request a secure reset link.">
      {message && <Notice className="bg-success-bg text-success">{message}</Notice>}
      {error && <Notice className="bg-danger-bg text-danger">{error}</Notice>}
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setMessage(null);
          setError(null);
          try {
            const response = await api.requestPasswordReset(email);
            setMessage(response.message);
          } catch (requestError: any) {
            setError(requestError.message || 'Unable to request a reset link.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="block font-mono text-xs font-bold uppercase">
          Registered email address
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full border-2 border-ink rounded-md p-3"
          />
        </label>
        <button
          disabled={loading}
          className="w-full bg-ink text-white rounded-md p-3 font-mono text-xs font-bold uppercase"
        >
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <Link to="/" className="block mt-6 text-center text-xs font-mono font-bold uppercase underline">
        Back to staff sign in
      </Link>
    </PasswordShell>
  );
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const token = searchParams.get('token') || '';

  return (
    <PasswordShell title="Reset password" subtitle="Choose a new password for your account.">
      {message && <Notice className="bg-success-bg text-success">{message}</Notice>}
      {error && <Notice className="bg-danger-bg text-danger">{error}</Notice>}
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password !== confirmation) return setError('Passwords do not match.');
          setLoading(true);
          setError(null);
          try {
            const response = await api.resetPassword(token, password);
            setMessage(response.message);
            setTimeout(() => navigate('/'), 900);
          } catch (requestError: any) {
            setError(requestError.message || 'Unable to reset password.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="block font-mono text-xs font-bold uppercase">
          New password
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full border-2 border-ink rounded-md p-3"
          />
        </label>
        <label className="block font-mono text-xs font-bold uppercase">
          Confirm password
          <input
            required
            minLength={8}
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 w-full border-2 border-ink rounded-md p-3"
          />
        </label>
        <button
          disabled={loading || !token}
          className="w-full bg-ink text-white rounded-md p-3 font-mono text-xs font-bold uppercase"
        >
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>
    </PasswordShell>
  );
}

function PasswordShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface border-2 border-ink p-8 rounded-lg"
      >
        <h1 className="text-3xl font-black text-ink mb-2">{title}</h1>
        <p className="text-sm text-ink-muted mb-8">{subtitle}</p>
        {children}
      </motion.div>
    </div>
  );
}

function Notice({ children, className }: { children: ReactNode; className: string }) {
  return <div className={`mb-5 p-4 text-sm rounded-md ${className}`}>{children}</div>;
}
