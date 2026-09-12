/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaffManagement } from './StaffManagement';
import { api } from '@/src/api';

vi.mock('@/src/api', () => ({
  api: {
    getProfile: vi.fn(),
    getAdminUsers: vi.fn(),
    createStaffAccount: vi.fn(),
    updateStaffDetails: vi.fn(),
    updateStaffRole: vi.fn(),
  },
}));
vi.mock('@/src/components/admin/KrawlSecurityAdmin', () => ({
  KrawlSecurityAdmin: () => <div>Krawl dashboard component</div>,
}));
const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StaffManagement />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getProfile).mockResolvedValue({ ...timestamps, id: 'admin-id', username: 'admin', role: 'admin' });
  vi.mocked(api.getAdminUsers).mockResolvedValue([]);
});
afterEach(cleanup);

describe('Staff management', () => {
  it('does not mount the Krawl dashboard on the staff management page', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Staff account management' })).toBeInTheDocument();
    expect(screen.queryByText('Krawl dashboard component')).not.toBeInTheDocument();
  });
  it('shows loading rather than empty staff counts while fetching', async () => {
    vi.mocked(api.getAdminUsers).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent('Loading staff accounts');
    expect(screen.queryByText('No administrator accounts.')).not.toBeInTheDocument();
  });
  it('shows an account query error rather than an empty directory', async () => {
    vi.mocked(api.getAdminUsers).mockRejectedValue(new Error('Database offline'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database offline');
    expect(screen.queryByText('No administrator accounts.')).not.toBeInTheDocument();
  });
  it.each(['staff', 'customer'] as const)('does not fetch admin records for a %s account', async (role) => {
    vi.mocked(api.getProfile).mockResolvedValue({ ...timestamps, id: 'other-id', username: 'other', role });
    renderPage();
    expect(await screen.findByText('Administrator access is required to manage staff.')).toBeInTheDocument();
    expect(api.getAdminUsers).not.toHaveBeenCalled();
  });
  it('shows account creation errors instead of silently failing', async () => {
    vi.mocked(api.createStaffAccount).mockRejectedValue(new Error('Username already exists'));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Create account' });
    fireEvent.submit(button.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Username already exists');
  });
});
