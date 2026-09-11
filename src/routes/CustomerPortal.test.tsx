/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CustomerPortal } from './CustomerPortal';
import { api } from '@/src/api';

vi.mock('@/src/api', () => ({
  api: {
    getCustomerProfile: vi.fn(),
    getCustomerTickets: vi.fn(),
    getCustomerNotifications: vi.fn(),
    markCustomerNotificationRead: vi.fn(),
    deleteCustomerNotification: vi.fn(),
    clearCustomerNotifications: vi.fn(),
  },
}));
const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CustomerPortal />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getCustomerProfile).mockResolvedValue({
    ...timestamps,
    id: 'customer-id',
    name: 'Customer',
    email: 'customer@example.com',
  });
  vi.mocked(api.getCustomerTickets).mockResolvedValue([]);
  vi.mocked(api.getCustomerNotifications).mockResolvedValue([]);
});
afterEach(cleanup);

describe('Customer portal', () => {
  it('does not present a ticket fetch failure as an empty account', async () => {
    vi.mocked(api.getCustomerTickets).mockRejectedValue(new Error('Database unavailable'));
    renderPage();
    expect(await screen.findByText('Unable to load your support space.')).toBeInTheDocument();
    expect(screen.queryByText('No ongoing tickets.')).not.toBeInTheDocument();
  });
  it('displays tickets returned by the API', async () => {
    vi.mocked(api.getCustomerTickets).mockResolvedValue([
      {
        ...timestamps,
        id: 'ticket-id',
        customerId: 'customer-id',
        title: 'Persisted request',
        description: 'Details',
        priority: 'Medium',
        status: 'Open',
        category: 'Technical',
      },
    ]);
    renderPage();
    expect(await screen.findByRole('link', { name: /Persisted request/ })).toHaveAttribute(
      'href',
      '/customer/tickets/ticket-id',
    );
    expect(screen.getByText('Ongoing tickets (1)')).toBeInTheDocument();
  });
  it('shows a failed notification deletion', async () => {
    vi.mocked(api.getCustomerNotifications).mockResolvedValue([
      {
        id: 'notification-id',
        ticketId: 'ticket-id',
        type: 'STATUS_CHANGE',
        message: 'Ticket updated',
        createdAt: timestamps.createdAt,
      },
    ]);
    vi.mocked(api.deleteCustomerNotification).mockRejectedValue(new Error('Unable to delete notification'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear notification: Ticket updated' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to delete notification');
  });
});
