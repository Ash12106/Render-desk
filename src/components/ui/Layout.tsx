import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Plus, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getStoredAuthUser } from '@/src/lib/auth';

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    navigate('/');
    window.location.reload();
  };
  const isAdmin = getStoredAuthUser()?.role === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="bg-canvas border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <span className="font-mono font-bold text-ink text-sm tracking-wider uppercase">Support Desk</span>
            <nav className="hidden md:flex space-x-4">
              <NavLink
                to="/tickets"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider transition-colors border-2',
                    isActive ? 'bg-ink text-white border-ink' : 'text-ink border-transparent hover:border-ink/30',
                  )
                }
              >
                Tickets dashboard
              </NavLink>
              {isAdmin && (
                <>
                  <NavLink
                    to="/staff"
                    className={({ isActive }) =>
                      cn(
                        'px-3 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider transition-colors border-2',
                        isActive ? 'bg-ink text-white border-ink' : 'text-ink border-transparent hover:border-ink/30',
                      )
                    }
                  >
                    Staff
                  </NavLink>
                  <NavLink
                    to="/staff-management"
                    className={({ isActive }) =>
                      cn(
                        'px-3 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider transition-colors border-2',
                        isActive ? 'bg-ink text-white border-ink' : 'text-ink border-transparent hover:border-ink/30',
                      )
                    }
                  >
                    Manage staff
                  </NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <NavLink
              to="/tickets/new"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-ink text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-ink/90 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Ticket
            </NavLink>
            <NavLink to="/profile" title="Open profile" className="p-2 text-ink hover:bg-line/20 rounded-full">
              <UserRound className="w-4 h-4" />
            </NavLink>
            <button
              onClick={handleLogout}
              className="p-2 text-ink hover:bg-line/20 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto py-8">
        <Outlet />
      </main>
    </div>
  );
}
