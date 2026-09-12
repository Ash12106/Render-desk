import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';

export function CustomerLayout() {
  const navigate = useNavigate();
  const logout = () => {
    localStorage.removeItem('auth_user');
    navigate('/customer/login');
    window.location.reload();
  };
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="bg-canvas border-b-2 border-ink">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/customer" className="font-mono font-bold text-ink text-sm tracking-wider uppercase">
            Support Desk <span className="text-ink-muted">/ Customer</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/customer" className="font-mono text-xs font-bold uppercase">
              My requests
            </Link>
            <Link to="/customer/tickets/new" className="font-mono text-xs font-bold uppercase">
              Raise ticket
            </Link>
            <Link to="/customer/profile" title="Open profile" className="p-2 text-ink hover:bg-line/20 rounded-full">
              <UserRound className="w-4 h-4" />
            </Link>
            <button onClick={logout} title="Sign out" className="p-2 text-ink hover:bg-line/20 rounded-full">
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 py-8">
        <Outlet />
      </main>
    </div>
  );
}
