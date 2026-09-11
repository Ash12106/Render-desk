/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { getStoredAuthUser } from './lib/auth';

vi.mock('./lib/auth', () => ({ getStoredAuthUser: vi.fn() }));
vi.mock('./components/admin/KrawlSecurityAdmin', () => ({
  KrawlSecurityAdmin: () => <div>Krawl monitoring content</div>,
}));
vi.mock('./routes/TicketsDashboard', () => ({ TicketsDashboard: () => <div>Tickets page</div> }));
vi.mock('./routes/CustomerPortal', () => ({ CustomerPortal: () => <div>Customer page</div> }));
vi.mock('./routes/Login', () => ({ Login: () => <div>Login page</div> }));

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/krawl');
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

function useAccount(role: 'admin' | 'staff' | 'customer') {
  vi.mocked(getStoredAuthUser).mockReturnValue({
    id: 'account-id',
    username: 'account',
    role,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
}

describe('Dedicated Krawl page navigation', () => {
  it('renders the dedicated page and active navigation link for admins', async () => {
    useAccount('admin');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Krawl dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Krawl monitoring content')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Krawl' });
    expect(link).toHaveAttribute('href', '/krawl');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('heading', { name: 'Staff account management' })).not.toBeInTheDocument();
  });
  it('opens Krawl from the admin navigation', async () => {
    useAccount('admin');
    window.history.replaceState({}, '', '/tickets');
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'Krawl' }));
    expect(await screen.findByText('Krawl monitoring content')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/krawl');
  });
  it.each([
    ['staff', 'Tickets page'],
    ['customer', 'Customer page'],
  ] as const)('keeps the %s account on its own page', async (role, page) => {
    useAccount(role);
    render(<App />);
    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Krawl' })).not.toBeInTheDocument();
    expect(screen.queryByText('Krawl monitoring content')).not.toBeInTheDocument();
  });
  it('opens login for a signed-out visitor', async () => {
    vi.mocked(getStoredAuthUser).mockReturnValue(null);
    render(<App />);
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Krawl monitoring content')).not.toBeInTheDocument();
  });
});
